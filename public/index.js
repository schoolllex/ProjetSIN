const canvas = document.getElementById("graphs");

const chart = new Chart(canvas, {
    data: {
        labels: [
            "8h", "9h", "10h", "11h", "12h",
            "13h", "14h", "15h", "16h", "17h"
        ],
        datasets: [
            {
                type: "bar",
                label: "Nombre de personnes",
                data: [5, 24, 28, 26, 3, 12, 30, 28, 19, 2],
                backgroundColor: "rgba(59, 130, 246, 0.5)",
                borderColor: "#3b82f6",
                borderWidth: 1,
                borderRadius: 4,
                yAxisID: "yPeople",
                order: 2
            },
            {
                type: "line",
                label: "Capteur 1",
                data: [19, 20.5, 23, 24.5, 23.5, 22.8, 24, 26, 25.5, 23.5],
                borderColor: "#ef4444",
                backgroundColor: "#ef4444",
                borderWidth: 2,
                tension: 0.3,
                yAxisID: "yTemperature",
                order: 1
            },
            {
                type: "line",
                label: "Capteur 2",
                data: [19.5, 20, 21.8, 23, 23.2, 22, 23.4, 24.7, 24, 22.8],
                borderColor: "#f59e0b",
                backgroundColor: "#f59e0b",
                borderWidth: 2,
                tension: 0.3,
                yAxisID: "yTemperature",
                order: 1
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
    duration: 1000,
    easing: "easeOutQuart"
},
        interaction: {
            mode: "index",
            intersect: false
        },
        scales: {
            yPeople: {
                type: "linear",
                position: "left",
                beginAtZero: true,
                title: {
                    display: true,
                    text: "Nombre de personnes"
                },
                ticks: {
                    precision: 0
                }
            },
            yTemperature: {
                type: "linear",
                position: "right",
                title: {
                    display: true,
                    text: "Température (°C)"
                },
                grid: {
                    drawOnChartArea: false
                }
            },
            x: {
                title: {
                    display: true,
                    text: "Heure"
                }
            }
        }
    }
});