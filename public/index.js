const canvas = document.getElementById("graphs");
const videoElement = document.getElementById("videosrc");
const chartContainer = canvas.parentElement;
const measurementInterval = 2000;
const videoInterval = 60000;
const maxPoints = 10;

const labels = [];
const peopleNumber = [];
const sensor1 = [];
const sensor2 = [];
const degreesPerPerson = [];

videoElement.classList.add("hidden");

const chart = new Chart(canvas, {
  data: {
    labels,
    datasets: [
      {
        type: "bar",
        label: "Nombre de personnes",
        data: peopleNumber,
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        borderColor: "#3b82f6",
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: "yPeople",
        order: 2,
      },
      {
        type: "line",
        label: "Capteur 1",
        data: sensor1,
        borderColor: "#ef4444",
        backgroundColor: "#ef4444",
        borderWidth: 2,
        tension: 0.3,
        yAxisID: "yTemperature",
        order: 1,
      },
      {
        type: "line",
        label: "Capteur 2",
        data: sensor2,
        borderColor: "#f59e0b",
        backgroundColor: "#f59e0b",
        borderWidth: 2,
        tension: 0.3,
        yAxisID: "yTemperature",
        order: 1,
      },
      {
        type: "line",
        label: "°C par personne",
        data: degreesPerPerson,
        borderColor: "#059669",
        backgroundColor: "#059669",
        borderWidth: 2,
        tension: 0.3,
        yAxisID: "yDegreesPerPerson",
        hidden: true,
        order: 1,
      },
      {
        type: "line",
        label: "Seuil de déclenchement",
        data: labels.map(() => 25),
        borderColor: "#960505",
        backgroundColor: "#960505",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0,
        hidden: false,
        order: 1,
      }
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: "easeOutQuart",
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    scales: {
      yPeople: {
        type: "linear",
        position: "left",
        beginAtZero: true,
        title: {
          display: true,
          text: "Nombre de personnes",
        },
        ticks: {
          precision: 0,
        },
      },
      yTemperature: {
        type: "linear",
        position: "right",
        title: {
          display: true,
          text: "Température (°C)",
        },
        grid: {
          drawOnChartArea: false,
        },
      },
      x: {
        title: {
          display: true,
          text: "Heure",
        },
      },
      yDegreesPerPerson: {
        type: "linear",
        display: "auto",
        position: "right",
        title: {
          display: true,
          text: "°C par personne",
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  },
});

// DATA
let nextVideo = 0;
let lastMeasure;

const searchLocalStorageVideos = () => {
  try {
    const videos = JSON.parse(localStorage.getItem("videoLink"));
    if(Array.isArray(videos)) return videos.filter(url => typeof url === "string" && url.trim());
  } catch (error) {
    console.error("Error loading videos:", error);
  }
  return [];
}

const showVideo = (url) => new Promise(resolve => {
  let finished = false;
  const finishVideo = () => {
    if(finished) return;
    finished = true;
    videoElement.removeEventListener("playing", displayVideo);
    videoElement.removeEventListener("ended", finishVideo);
    videoElement.removeEventListener("error", finishVideo);
    videoElement.classList.add("hidden");
    chartContainer.classList.remove("hidden");
    videoElement.removeAttribute("src");
    videoElement.load();
    resolve();
  };

  const displayVideo = () => {
    chartContainer.classList.add("hidden");
    videoElement.classList.remove("hidden");
  };

  videoElement.addEventListener("playing", displayVideo, { once: true });
  videoElement.addEventListener("ended", finishVideo, { once: true });
  videoElement.addEventListener("error", finishVideo, { once: true });
  videoElement.src = url;
  videoElement.play().catch(finishVideo);
});

const playNextVideo = async () => {
  try {
    const videos = searchLocalStorageVideos();
    if(videos.length === 0) return;

    const index = nextVideo % videos.length;
    nextVideo = index + 1;
    await showVideo(videos[index]);
  } finally {
    setTimeout(playNextVideo, videoInterval);
  }
};

window.addVideo = (url) => {
  if(typeof url !== "string" || !url.trim()) return;
  const videos = searchLocalStorageVideos();
  videos.push(url.trim());
  localStorage.setItem("videoLink", JSON.stringify(videos));
}

window.removeVideo = (index) => {
  const videos = searchLocalStorageVideos();
  if(!Number.isInteger(index) || index < 0 || index >= videos.length) return;
  videos.splice(index, 1);
  if(index < nextVideo) nextVideo--;
  localStorage.setItem("videoLink", JSON.stringify(videos));
}

const fetchNewMeasure = async () => {
  try {
    const req = await fetch("/devices", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if(!req.ok) return console.error("Fetch error:", req.status);
    const res = await req.json();
    if(!res.success || !Array.isArray(res.devices)) return console.error("Invalid devices response");

    const camera = res.devices.find(device => device.firmware === "CAMERA");
    const detection = camera?.camera?.detections[0];
    const sensors = res.devices.filter(device => device.firmware === "TEMPERATURE").slice(0, 2);
    const firstSensor = sensors[0]?.sensors[0];
    const secondSensor = sensors[1]?.sensors[0];
    const measure = JSON.stringify([camera?.id, detection, sensors.map(device => [device.id, device.sensors[0]])]);
    const timestamps = [detection?.recordedAt, firstSensor?.lastReadAt, secondSensor?.lastReadAt];
    const times = timestamps.filter(Boolean).map(timestamp => Date.parse(timestamp));
    if(times.length === 0 || measure === lastMeasure) return;

    labels.push(new Date(Math.max(...times)).toLocaleTimeString("fr-FR"));
    peopleNumber.push(detection?.personCount ?? null);
    sensor1.push(firstSensor?.lastValue ?? null);
    sensor2.push(secondSensor?.lastValue ?? null);
    const personCount = detection?.personCount;
    const temperatures = [firstSensor?.lastValue, secondSensor?.lastValue].filter(Number.isFinite);
    const ratio = personCount > 0 && temperatures.length > 0
      ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length / personCount
      : null;
    degreesPerPerson.push(ratio);

    if(labels.length > maxPoints){
      labels.shift();
      peopleNumber.shift();
      sensor1.shift();
      sensor2.shift();
      degreesPerPerson.shift();
    }

    lastMeasure = measure;
    chart.update();
  } catch (error) {
    console.error("Fetch error:", error);
  } finally {
    setTimeout(fetchNewMeasure, measurementInterval);
  }
}

fetchNewMeasure();
setTimeout(playNextVideo, videoInterval);
