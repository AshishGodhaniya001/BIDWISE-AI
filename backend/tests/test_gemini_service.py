from types import SimpleNamespace

from services import gemini_service


def test_gemini_caches_client_and_reuses_it(monkeypatch):
    gemini_service._gemini_client = None
    calls: list[int] = []

    class Models:
        def generate_content(self, **_kwargs):
            calls.append(1)
            return SimpleNamespace(text='{"ok": true}')

    class Client:
        models = Models()

    monkeypatch.setattr(gemini_service, "_get_client", lambda: Client)
    assert gemini_service._call_gemini("test") == '{"ok": true}'
    assert sum(calls) == 1
