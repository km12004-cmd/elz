from app.modules.flashcards.schemas import FolderCreate


def test_folder_create_accepts_title():
    payload = FolderCreate.model_validate({"title": "  Spanish A1  "})
    assert payload.title == "Spanish A1"


def test_folder_create_accepts_name_alias():
    payload = FolderCreate.model_validate({"name": "  Spanish A1  "})
    assert payload.title == "Spanish A1"


def test_folder_create_accepts_folder_name_alias():
    payload = FolderCreate.model_validate({"folder_name": "  Spanish A1  "})
    assert payload.title == "Spanish A1"
