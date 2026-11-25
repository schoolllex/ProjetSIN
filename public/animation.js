const delay = ms => new Promise(res => setTimeout(res, ms));

document.addEventListener("DOMContentLoaded", async (event) => {
  await delay(10000);
  document.getElementById("scene").classList.add("hidden");
})