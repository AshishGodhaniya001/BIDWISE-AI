from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from config import ASYNC_DATABASE_URL, DATABASE_URL


_async_url = ASYNC_DATABASE_URL
_conn_args: dict = {}
if _async_url.startswith("sqlite"):
    _conn_args["check_same_thread"] = False
    if "?" not in _async_url:
        _async_url += "?pragma=foreign_keys(1)"

async_engine = create_async_engine(_async_url, connect_args=_conn_args, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)

sync_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(sync_engine)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as db:
        yield db
