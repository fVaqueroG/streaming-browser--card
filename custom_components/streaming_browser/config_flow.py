"""Streaming Browser setup and optional JustWatch account linking."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .justwatch import JustWatchAuthError, JustWatchGraphQLApi

DOMAIN = "streaming_browser"
_TOKEN_KEYS = ("justwatch_access_token", "justwatch_refresh_token", "justwatch_email")


class StreamingBrowserConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Install the standalone Streaming Browser integration."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Streaming Browser", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Manage JustWatch without requiring a Nuvio account or a new card."""
        return StreamingBrowserOptionsFlow()


class StreamingBrowserOptionsFlow(config_entries.OptionsFlow):
    """JustWatch account setup using the existing server-side resolver."""

    async def async_step_init(self, user_input=None):
        options = ["email", "token"]
        if self.config_entry.options.get("justwatch_access_token") or self.config_entry.options.get("justwatch_refresh_token"):
            options.append("disconnect")
        return self.async_show_menu(step_id="init", menu_options=options)

    async def async_step_email(self, user_input=None):
        errors = {}
        if user_input is not None:
            email = str(user_input.get("justwatch_email") or "").strip()
            password = str(user_input.get("justwatch_password") or "")
            try:
                auth = await JustWatchGraphQLApi(
                    async_get_clientsession(self.hass)
                ).async_sign_in(email, password)
            except JustWatchAuthError:
                errors["base"] = "invalid_auth"
            else:
                options = dict(self.config_entry.options)
                for key in _TOKEN_KEYS:
                    options.pop(key, None)
                options.update({
                    "justwatch_email": auth.get("email") or email,
                    "justwatch_access_token": auth["access_token"],
                    "justwatch_refresh_token": auth["refresh_token"],
                })
                # Never store the password in Home Assistant or card config.
                return self.async_create_entry(title="", data=options)
        return self.async_show_form(
            step_id="email",
            data_schema=vol.Schema({
                vol.Required("justwatch_email", default=str(
                    self.config_entry.options.get("justwatch_email") or "")): str,
                vol.Required("justwatch_password"): selector.TextSelector(
                    selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
                ),
            }),
            errors=errors,
        )

    async def async_step_token(self, user_input=None):
        errors = {}
        if user_input is not None:
            token = str(user_input.get("justwatch_access_token") or "").strip()
            try:
                identity = await JustWatchGraphQLApi(
                    async_get_clientsession(self.hass), access_token=token,
                ).async_validate_auth()
            except JustWatchAuthError:
                errors["base"] = "invalid_auth"
            else:
                options = dict(self.config_entry.options)
                for key in _TOKEN_KEYS:
                    options.pop(key, None)
                options.update({
                    "justwatch_access_token": token,
                    "justwatch_email": identity.get("email") or "",
                })
                # Browser ID tokens expire. Only email sign-in gives a renewable session.
                return self.async_create_entry(title="", data=options)
        return self.async_show_form(
            step_id="token",
            data_schema=vol.Schema({
                vol.Required("justwatch_access_token"): selector.TextSelector(
                    selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
                ),
            }),
            errors=errors,
        )

    async def async_step_disconnect(self, user_input=None):
        if user_input is not None:
            options = dict(self.config_entry.options)
            for key in _TOKEN_KEYS:
                options.pop(key, None)
            return self.async_create_entry(title="", data=options)
        return self.async_show_form(step_id="disconnect", data_schema=vol.Schema({}))
