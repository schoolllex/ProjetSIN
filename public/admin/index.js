const form = document.getElementById("threshold-form");
const deviceSelect = document.getElementById("device");
const newDeviceSelect = document.getElementById("new-device");
const addButton = document.getElementById("add-fan");
const fanList = document.getElementById("fans");
const actionButtons = document.querySelectorAll("#fan-actions button");
const startInput = document.getElementById("start-threshold");
const stopInput = document.getElementById("stop-threshold");
const saveButton = document.getElementById("save-thresholds");
const statusMessage = document.getElementById("status");

let busy = false;
let thresholdsLoaded = false;

function selectedFans() {
  return Array.from(fanList.querySelectorAll("input:checked"), (input) => input.value);
}

function updateControls() {
  const hasSelection = selectedFans().length > 0;
  for (const button of actionButtons) {
    button.disabled = busy || !hasSelection;
  }
  newDeviceSelect.disabled = addButton.disabled = busy || !newDeviceSelect.value;
  deviceSelect.disabled = busy || !deviceSelect.value;
  startInput.disabled = stopInput.disabled = saveButton.disabled = busy || !thresholdsLoaded;
}

async function runAction(action) {
  busy = true;
  updateControls();
  statusMessage.textContent = "";

  try {
    await action();
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    busy = false;
    updateControls();
  }
}

async function request(url, message, method = "GET", data) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  if (!response.ok) throw new Error(message);

  return response.json();
}

function fanUrl(deviceId) {
  return `/devices/${encodeURIComponent(deviceId)}/fan`;
}

async function loadThresholds() {
  thresholdsLoaded = false;
  startInput.value = "";
  stopInput.value = "";
  if (!deviceSelect.value) return;

  const thresholds = await request(`${fanUrl(deviceSelect.value)}/thresholds`, "Impossible de charger les seuils.");
  startInput.value = thresholds.startThreshold;
  stopInput.value = thresholds.stopThreshold;
  thresholdsLoaded = true;
}

async function loadDevices() {
  const currentDevice = deviceSelect.value;
  const selection = selectedFans();
  const { devices } = await request("/devices", "Impossible de charger les capteurs.");
  deviceSelect.replaceChildren();
  newDeviceSelect.replaceChildren();
  fanList.replaceChildren();

  for (const device of devices) {
    if (device.firmware !== "TEMPERATURE") continue;
    const name = `${device.name} (${device.identifier})`;
    const fan = device.fans[0];
    if (!fan) {
      newDeviceSelect.add(new Option(name, device.id));
      continue;
    }

    deviceSelect.add(new Option(name, device.id));
    const row = fanList.insertRow();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = device.id;
    checkbox.checked = selection.includes(device.id);
    checkbox.setAttribute("aria-label", `Sélectionner le ventilateur de ${name}`);
    row.insertCell().append(checkbox);
    row.insertCell().textContent = name;
    row.insertCell().textContent = fan.mode === "AUTO" ? "Automatique" : "Manuel";
    row.insertCell().textContent = fan.desiredState ? "Allumé" : "Éteint";
  }

  if (Array.from(deviceSelect.options).some((option) => option.value === currentDevice)) {
    deviceSelect.value = currentDevice;
  }
  if (deviceSelect.value !== currentDevice || !thresholdsLoaded) await loadThresholds();
}

addButton.addEventListener("click", () => runAction(async () => {
  await request(fanUrl(newDeviceSelect.value), "Impossible d’ajouter le ventilateur.", "POST");
  await loadDevices();
  statusMessage.textContent = "Ventilateur ajouté.";
}));

for (const button of actionButtons) {
  button.addEventListener("click", () => runAction(async () => {
    const mode = button.dataset.mode;
    const settings = mode === "auto" ? { mode: "AUTO" } : { mode: "MANUAL", on: mode === "on" };
    const result = await request("/devices/fans/settings", "Impossible d’envoyer la commande.", "PATCH", {
      deviceIds: selectedFans(),
      settings
    });
    statusMessage.textContent = `Consigne enregistrée pour ${result.updated} ventilateur(s) sur ${result.requested}.`;
    await loadDevices();
  }));
}

fanList.addEventListener("change", updateControls);
deviceSelect.addEventListener("change", () => runAction(loadThresholds));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const startThreshold = startInput.valueAsNumber;
  const stopThreshold = stopInput.valueAsNumber;
  if (!Number.isFinite(startThreshold) || !Number.isFinite(stopThreshold)) {
    statusMessage.textContent = "Renseigne les deux températures.";
    return;
  }
  if (stopThreshold >= startThreshold) {
    statusMessage.textContent = "Le seuil d’arrêt doit être inférieur au seuil de démarrage.";
    return;
  }

  runAction(async () => {
    await request(`${fanUrl(deviceSelect.value)}/thresholds`, "Impossible d’enregistrer les seuils.", "PATCH", {
      startThreshold,
      stopThreshold
    });
    statusMessage.textContent = "Seuils enregistrés.";
  });
});

runAction(loadDevices);
