const button = document.getElementById("testButton");
const message = document.getElementById("message");

button.addEventListener("click", function() {
    message.textContent = "No problem I changed it.";
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
        .then(function() {
            console.log("Service worker registered.");
        })
        .catch(function(error) {
            console.error("Service worker registration failed:", error);
        });
}