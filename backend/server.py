from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any
from contextlib import asynccontextmanager

import bcrypt
import jwt
import pandas as pd
from bson import ObjectId
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Request,
    Response,
    UploadFile,
    File,
    Form,
    Query,
)
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

# ---------- MongoDB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------- Constants ----------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = 60 * 12  # 12h for a workday convenience
REFRESH_TOKEN_TTL_DAYS = 7


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# ---------- Models ----------
def _oid_to_str(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_oid_to_str)]


class UserPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: PyObjectId = Field(alias="_id")
    email: EmailStr
    name: str
    role: str
    created_at: Optional[datetime] = None


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class InviteUserInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: str = Field(default="admin")


class PriceRecordCreate(BaseModel):
    part_no: str = Field(min_length=1)
    unit_price: float = Field(ge=0)
    cpq_number: str = Field(min_length=1)
    cpq_date: str  # ISO date "YYYY-MM-DD"
    customer: str = Field(min_length=1)
    cpq_price: float = Field(ge=0)
    notes: Optional[str] = ""


class PriceRecordUpdate(BaseModel):
    part_no: Optional[str] = None
    unit_price: Optional[float] = None
    cpq_number: Optional[str] = None
    cpq_date: Optional[str] = None
    customer: Optional[str] = None
    cpq_price: Optional[float] = None
    notes: Optional[str] = None


class CPQBatchLine(BaseModel):
    part_no: str
    unit_price: float
    customer: str
    cpq_price: float
    notes: Optional[str] = ""


class CPQBatchCreate(BaseModel):
    cpq_number: str
    cpq_date: str
    lines: List[CPQBatchLine]


class ImportRow(BaseModel):
    part_no: str
    unit_price: float
    cpq_number: str
    cpq_date: str
    customer: str
    cpq_price: float
    notes: Optional[str] = ""


class ImportCommit(BaseModel):
    rows: List[ImportRow]


class DuplicateCPQInput(BaseModel):
    cpq_number: str
    source_customer: str
    target_customers: List[str] = Field(min_length=1)
    new_cpq_number: Optional[str] = None
    new_cpq_date: Optional[str] = None


# ---------- Password Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------- JWT Helpers ----------
def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=ACCESS_TOKEN_TTL_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Helpers ----------
def compute_discount(unit_price: float, cpq_price: float) -> float:
    if unit_price and unit_price > 0:
        return round((unit_price - cpq_price) / unit_price * 100, 2)
    return 0.0


def serialize_price_record(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "part_no": doc.get("part_no", ""),
        "unit_price": float(doc.get("unit_price", 0)),
        "cpq_number": doc.get("cpq_number", ""),
        "cpq_date": doc.get("cpq_date", ""),
        "customer": doc.get("customer", ""),
        "cpq_price": float(doc.get("cpq_price", 0)),
        "discount_pct": compute_discount(
            float(doc.get("unit_price", 0)), float(doc.get("cpq_price", 0))
        ),
        "notes": doc.get("notes", ""),
        "created_by": doc.get("created_by"),
        "created_by_name": doc.get("created_by_name"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def parse_iso_date(s: str) -> str:
    """Normalize input to YYYY-MM-DD string."""
    try:
        if isinstance(s, datetime):
            return s.strftime("%Y-%m-%d")
        # Try several formats
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(str(s)[:10], fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        # Try pandas
        return pd.to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s}")


# ---------- App ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.price_records.create_index("part_no")
    await db.price_records.create_index("cpq_number")
    await db.price_records.create_index("customer")
    await db.price_records.create_index("cpq_date")
    yield
    client.close()


app = FastAPI(lifespan=lifespan)
api = APIRouter(prefix="/api")


# ---------- Auth Routes ----------
@api.get("/auth/bootstrap-status")
async def bootstrap_status():
    count = await db.users.count_documents({})
    return {"has_users": count > 0}


@api.post("/auth/register", response_model=UserPublic)
async def register(input: RegisterInput, response: Response):
    """Registration is only allowed when there are zero users (bootstrap).
    After that, admins invite via /auth/invite."""
    count = await db.users.count_documents({})
    if count > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed. Ask an admin to invite you.",
        )
    email = input.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": "admin",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    access = create_access_token(str(result.inserted_id), email)
    refresh = create_refresh_token(str(result.inserted_id))
    set_auth_cookies(response, access, refresh)
    doc["_id"] = str(result.inserted_id)
    doc.pop("password_hash", None)
    return doc


@api.post("/auth/login", response_model=UserPublic)
async def login(input: LoginInput, response: Response):
    email = input.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(str(user["_id"]), email)
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh_token_endpoint(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rt, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        new_access = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(
            key="access_token",
            value=new_access,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=ACCESS_TOKEN_TTL_MINUTES * 60,
            path="/",
        )
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@api.post("/auth/invite", response_model=UserPublic)
async def invite_user(
    input: InviteUserInput, user: dict = Depends(get_current_user)
):
    email = input.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": input.role or "admin",
        "created_at": datetime.now(timezone.utc),
        "invited_by": user["_id"],
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc.pop("password_hash", None)
    return doc


@api.get("/users", response_model=List[UserPublic])
async def list_users(user: dict = Depends(get_current_user)):
    rows = await db.users.find({}, {"password_hash": 0}).sort("created_at", -1).to_list(1000)
    for r in rows:
        r["_id"] = str(r["_id"])
    return rows


# ---------- Price Record Routes ----------
@api.post("/price-records")
async def create_price_record(
    input: PriceRecordCreate, user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    doc = {
        "part_no": input.part_no.strip(),
        "unit_price": float(input.unit_price),
        "cpq_number": input.cpq_number.strip(),
        "cpq_date": parse_iso_date(input.cpq_date),
        "customer": input.customer.strip(),
        "cpq_price": float(input.cpq_price),
        "notes": input.notes or "",
        "created_by": user["_id"],
        "created_by_name": user.get("name") or user.get("email"),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.price_records.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_price_record(doc)


@api.post("/price-records/batch")
async def create_batch(
    input: CPQBatchCreate, user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    cpq_date = parse_iso_date(input.cpq_date)
    cpq_number = input.cpq_number.strip()
    docs = []
    for line in input.lines:
        docs.append(
            {
                "part_no": line.part_no.strip(),
                "unit_price": float(line.unit_price),
                "cpq_number": cpq_number,
                "cpq_date": cpq_date,
                "customer": line.customer.strip(),
                "cpq_price": float(line.cpq_price),
                "notes": line.notes or "",
                "created_by": user["_id"],
                "created_by_name": user.get("name") or user.get("email"),
                "created_at": now,
                "updated_at": now,
            }
        )
    if not docs:
        raise HTTPException(status_code=400, detail="No line items provided")
    result = await db.price_records.insert_many(docs)
    return {"inserted": len(result.inserted_ids)}


@api.get("/price-records")
async def list_price_records(
    q: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if q:
        term = q.strip()
        query = {
            "$or": [
                {"part_no": {"$regex": term, "$options": "i"}},
                {"cpq_number": {"$regex": term, "$options": "i"}},
                {"customer": {"$regex": term, "$options": "i"}},
            ]
        }
    docs = (
        await db.price_records.find(query)
        .sort([("cpq_date", -1), ("created_at", -1)])
        .to_list(limit)
    )
    return [serialize_price_record(d) for d in docs]


@api.get("/price-records/parts")
async def list_parts(user: dict = Depends(get_current_user)):
    """Return distinct parts with latest unit price and CPQ count."""
    pipeline = [
        {"$sort": {"cpq_date": -1, "created_at": -1}},
        {
            "$group": {
                "_id": "$part_no",
                "latest_unit_price": {"$first": "$unit_price"},
                "latest_cpq_date": {"$first": "$cpq_date"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await db.price_records.aggregate(pipeline).to_list(5000)
    return [
        {
            "part_no": r["_id"],
            "latest_unit_price": float(r.get("latest_unit_price", 0) or 0),
            "latest_cpq_date": r.get("latest_cpq_date", ""),
            "record_count": r["count"],
        }
        for r in rows
    ]


@api.get("/price-records/by-part/{part_no}")
async def get_by_part(part_no: str, user: dict = Depends(get_current_user)):
    docs = (
        await db.price_records.find({"part_no": part_no})
        .sort([("cpq_date", -1), ("created_at", -1)])
        .to_list(1000)
    )
    if not docs:
        raise HTTPException(status_code=404, detail="Part not found")
    records = [serialize_price_record(d) for d in docs]
    latest_unit_price = records[0]["unit_price"]
    return {
        "part_no": part_no,
        "latest_unit_price": latest_unit_price,
        "latest_cpq_date": records[0]["cpq_date"],
        "records": records,
    }


@api.get("/price-records/{record_id}")
async def get_price_record(record_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(record_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    doc = await db.price_records.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_price_record(doc)


@api.patch("/price-records/{record_id}")
async def update_price_record(
    record_id: str,
    input: PriceRecordUpdate,
    user: dict = Depends(get_current_user),
):
    try:
        oid = ObjectId(record_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    updates = {k: v for k, v in input.model_dump(exclude_unset=True).items() if v is not None}
    if "cpq_date" in updates:
        updates["cpq_date"] = parse_iso_date(updates["cpq_date"])
    for k in ("unit_price", "cpq_price"):
        if k in updates:
            updates[k] = float(updates[k])
    for k in ("part_no", "cpq_number", "customer"):
        if k in updates and isinstance(updates[k], str):
            updates[k] = updates[k].strip()
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.price_records.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.price_records.find_one({"_id": oid})
    return serialize_price_record(doc)


@api.delete("/price-records/{record_id}")
async def delete_price_record(
    record_id: str, user: dict = Depends(get_current_user)
):
    try:
        oid = ObjectId(record_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    result = await db.price_records.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------- Excel Import ----------
@api.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...), user: dict = Depends(get_current_user)
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Upload .xlsx, .xls or .csv")
    content = await file.read()
    try:
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")
    df = df.fillna("")
    columns = [str(c) for c in df.columns.tolist()]
    # normalize any datetime cells to strings for JSON
    sample = df.head(20).astype(str).to_dict(orient="records")
    all_rows = df.astype(str).to_dict(orient="records")
    return {
        "columns": columns,
        "sample_rows": sample,
        "all_rows": all_rows,
        "row_count": len(all_rows),
    }


@api.post("/import/commit")
async def import_commit(
    payload: ImportCommit, user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    docs = []
    errors: List[dict] = []
    for idx, row in enumerate(payload.rows):
        try:
            docs.append(
                {
                    "part_no": row.part_no.strip(),
                    "unit_price": float(row.unit_price),
                    "cpq_number": row.cpq_number.strip(),
                    "cpq_date": parse_iso_date(row.cpq_date),
                    "customer": row.customer.strip(),
                    "cpq_price": float(row.cpq_price),
                    "notes": row.notes or "",
                    "created_by": user["_id"],
                    "created_by_name": user.get("name") or user.get("email"),
                    "created_at": now,
                    "updated_at": now,
                }
            )
        except Exception as e:
            errors.append({"row": idx, "error": str(e)})
    if not docs:
        raise HTTPException(status_code=400, detail=f"No valid rows. Errors: {errors}")
    result = await db.price_records.insert_many(docs)
    return {"inserted": len(result.inserted_ids), "errors": errors}


@api.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    total_records = await db.price_records.count_documents({})
    distinct_parts = len(await db.price_records.distinct("part_no"))
    distinct_customers = len(await db.price_records.distinct("customer"))
    distinct_cpq = len(await db.price_records.distinct("cpq_number"))
    return {
        "total_records": total_records,
        "distinct_parts": distinct_parts,
        "distinct_customers": distinct_customers,
        "distinct_cpq": distinct_cpq,
    }


# ---------- Duplicate CPQ across customers ----------
@api.post("/price-records/duplicate")
async def duplicate_cpq(
    input: DuplicateCPQInput, user: dict = Depends(get_current_user)
):
    source_rows = await db.price_records.find(
        {"cpq_number": input.cpq_number, "customer": input.source_customer}
    ).to_list(1000)
    if not source_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No records found for CPQ '{input.cpq_number}' + customer '{input.source_customer}'",
        )
    targets = [c.strip() for c in input.target_customers if c and c.strip()]
    if not targets:
        raise HTTPException(status_code=400, detail="No target customers")

    new_cpq_number = (
        input.new_cpq_number.strip() if input.new_cpq_number else input.cpq_number
    )
    new_cpq_date = (
        parse_iso_date(input.new_cpq_date)
        if input.new_cpq_date
        else source_rows[0].get("cpq_date")
    )
    now = datetime.now(timezone.utc)
    new_docs = []
    for target in targets:
        for src in source_rows:
            new_docs.append(
                {
                    "part_no": src["part_no"],
                    "unit_price": float(src.get("unit_price", 0)),
                    "cpq_number": new_cpq_number,
                    "cpq_date": new_cpq_date,
                    "customer": target,
                    "cpq_price": float(src.get("cpq_price", 0)),
                    "notes": src.get("notes", ""),
                    "created_by": user["_id"],
                    "created_by_name": user.get("name") or user.get("email"),
                    "created_at": now,
                    "updated_at": now,
                }
            )
    result = await db.price_records.insert_many(new_docs)
    return {
        "inserted": len(result.inserted_ids),
        "new_cpq_number": new_cpq_number,
        "target_customers": targets,
    }


# ---------- Excel Export ----------
def _build_xlsx(rows: List[dict], title: str = "Price Records") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    headers = [
        "Part No",
        "CPQ #",
        "CPQ Date",
        "Customer",
        "Unit Price (RM)",
        "CPQ Price (RM)",
        "Discount %",
        "Notes",
        "Created By",
        "Created At",
    ]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="0F172A")
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for r_idx, r in enumerate(rows, 2):
        ws.cell(row=r_idx, column=1, value=r.get("part_no", ""))
        ws.cell(row=r_idx, column=2, value=r.get("cpq_number", ""))
        ws.cell(row=r_idx, column=3, value=r.get("cpq_date", ""))
        ws.cell(row=r_idx, column=4, value=r.get("customer", ""))
        ws.cell(row=r_idx, column=5, value=float(r.get("unit_price", 0) or 0))
        ws.cell(row=r_idx, column=6, value=float(r.get("cpq_price", 0) or 0))
        ws.cell(row=r_idx, column=7, value=float(r.get("discount_pct", 0) or 0))
        ws.cell(row=r_idx, column=8, value=r.get("notes", ""))
        ws.cell(row=r_idx, column=9, value=r.get("created_by_name", ""))
        created = r.get("created_at")
        if isinstance(created, datetime):
            created = created.strftime("%Y-%m-%d %H:%M")
        ws.cell(row=r_idx, column=10, value=str(created or ""))

    # Currency + pct formatting
    for row in ws.iter_rows(min_row=2, min_col=5, max_col=6):
        for cell in row:
            cell.number_format = '"RM " #,##0.00'
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=7):
        for cell in row:
            cell.number_format = "0.00\\%"

    widths = [16, 18, 12, 22, 16, 16, 12, 30, 18, 18]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i) if i <= 26 else "A" + chr(64 + i - 26)].width = w
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


@api.get("/export/xlsx")
async def export_xlsx(
    q: Optional[str] = None,
    part_no: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if part_no:
        query["part_no"] = part_no
    elif q:
        term = q.strip()
        query = {
            "$or": [
                {"part_no": {"$regex": term, "$options": "i"}},
                {"cpq_number": {"$regex": term, "$options": "i"}},
                {"customer": {"$regex": term, "$options": "i"}},
            ]
        }
    docs = (
        await db.price_records.find(query)
        .sort([("cpq_date", -1), ("created_at", -1)])
        .to_list(10000)
    )
    rows = [serialize_price_record(d) for d in docs]
    title = f"Part {part_no}" if part_no else "Price Records"
    xlsx_bytes = _build_xlsx(rows, title=title)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    filename = (
        f"farg-part-{part_no}-{stamp}.xlsx"
        if part_no
        else f"farg-price-records-{stamp}.xlsx"
    )
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
