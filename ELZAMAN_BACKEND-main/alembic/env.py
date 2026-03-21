from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db.base import Base
import app.db.models  # noqa: F401 - imports metadata models for autogenerate

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata
TARGET_DB_SCHEMA = os.getenv("DB_SCHEMA", "public").strip() or "public"
ALEMBIC_VERSION_TABLE = "alembic_version"


def _quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _include_object(object_, name, type_, reflected, compare_to):  # noqa: ANN001, ANN201
    if type_ == "table" and name == ALEMBIC_VERSION_TABLE:
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        version_table_schema=TARGET_DB_SCHEMA,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    if connection.dialect.name == "postgresql":
        quoted_schema = _quote_ident(TARGET_DB_SCHEMA)
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {quoted_schema}"))
        connection.execute(text(f"SET search_path TO {quoted_schema}"))
        # Persist schema creation/search_path before Alembic starts its tx block.
        connection.commit()

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        version_table_schema=TARGET_DB_SCHEMA,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
