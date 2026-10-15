"""Read-only client for the main Node API.

Every call forwards the caller's own Authorization header, so the Node API's
role and shop checks apply unchanged. There is deliberately no method here
that writes: bookings, cancellations and reschedules are made by the browser
after the client presses Confirm.
"""

import httpx

from . import config


class BackendError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(f"{status} {code}")
        self.status = status
        self.code = code


class Backend:
    def __init__(self, http: httpx.AsyncClient, authorization: str):
        self._http = http
        self._headers = {"Authorization": authorization}

    async def get(self, path: str, params: dict | None = None):
        res = await self._http.get(
            f"{config.MAIN_API_URL}{path}", params=params, headers=self._headers
        )
        if res.status_code >= 400:
            code = ""
            try:
                code = str(res.json().get("error", ""))
            except Exception:
                pass
            raise BackendError(res.status_code, code)
        return res.json()
