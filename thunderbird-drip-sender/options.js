function buildDayCheckboxes(days) {
  const container = document.getElementById("days");
  container.innerHTML = "";
  for (const key of DAY_KEYS) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `day-${key}`;
    checkbox.checked = !!days[key];
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(DAY_LABELS[key]));
    container.appendChild(label);
  }
}

async function load() {
  const { settings } = await getState();
  buildDayCheckboxes(settings.days);
  document.getElementById("start-time").value = settings.startTime;
  document.getElementById("end-time").value = settings.endTime;
  document.getElementById("interval").value = settings.intervalMinutes;
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const days = {};
  for (const key of DAY_KEYS) {
    days[key] = document.getElementById(`day-${key}`).checked;
  }
  const startTime = document.getElementById("start-time").value || DEFAULT_SETTINGS.startTime;
  const endTime = document.getElementById("end-time").value || DEFAULT_SETTINGS.endTime;
  const intervalMinutes = Math.max(1, parseInt(document.getElementById("interval").value, 10) || DEFAULT_SETTINGS.intervalMinutes);

  const settings = { days, startTime, endTime, intervalMinutes };
  await messenger.storage.local.set({ settings });
  await logEvent(
    `Settings saved: ${startTime}-${endTime}, every ${intervalMinutes}m, days: ${DAY_KEYS.filter((k) => days[k]).join(",") || "none"}.`
  );

  const savedMsg = document.getElementById("saved-msg");
  savedMsg.hidden = false;
  setTimeout(() => (savedMsg.hidden = true), 2000);
});

load();
