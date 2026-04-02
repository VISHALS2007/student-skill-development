// This file contains the JavaScript functionality for the course page.
// It handles dynamic elements such as the progress indicators, 
// the start/continue button functionality, and highlighting the current module.

document.addEventListener('DOMContentLoaded', () => {
    const modules = document.querySelectorAll('.module-card');
    const progressIndicators = document.querySelectorAll('.progress-indicator');

    modules.forEach((module, index) => {
        const progress = progressIndicators[index];
        const startButton = module.querySelector('.start-continue-button');

        // Example progress data, this could be fetched from a server or local storage
        const progressData = Math.floor(Math.random() * 101); // Random progress between 0 and 100
        progress.style.width = `${progressData}%`;
        progress.textContent = `${progressData}% Completed`;

        startButton.addEventListener('click', () => {
            // Logic to start or continue the module
            alert(`Starting/Continuing Module ${index + 1}: ${module.querySelector('.module-title').textContent}`);
        });

        // Highlight the current module if applicable
        if (module.classList.contains('current-module')) {
            module.classList.add('highlight');
        }
    });
});