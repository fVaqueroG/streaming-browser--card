/* Streaming Browser v0.4.79: synchronize power helper controls with Home Assistant state. */
(() => {
  const descriptor = Object.getOwnPropertyDescriptor(StreamingBrowserCard.prototype, 'hass');
  if (!descriptor?.set) return;
  Object.defineProperty(StreamingBrowserCard.prototype, 'hass', {
    ...descriptor,
    set(value) {
      descriptor.set.call(this, value);
      this._roomPowerRefresh?.();
    },
  });
})();