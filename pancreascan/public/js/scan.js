function getAuthToken() {
    return localStorage.getItem('ps_token');
}
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('scanInput');
    const submitBtn = document.getElementById('scanSubmit');
    const resultDiv = document.getElementById('scanResult');

    submitBtn.addEventListener('click', async () => {
        if (!input.files || input.files.length === 0) {
            resultDiv.textContent = 'Please choose an image first.';
            return;
        }

        const token = getAuthToken();
        if (!token) {
            resultDiv.textContent = 'You must be logged in to analyze a scan.';
            return;
        }

        const file = input.files[0];
        const formData = new FormData();
        formData.append('image', file);

        resultDiv.textContent = 'Analyzing scan...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/scans/upload', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Something went wrong.');
            }

            const data = await response.json();
            const { result, confidence } = data.scan;

            resultDiv.innerHTML = `
        <p><strong>Result:</strong> ${result.toUpperCase()}</p>
        <p>Confidence: ${confidence}%</p>
      `;
        } catch (err) {
            resultDiv.textContent = `Error: ${err.message}`;
        } finally {
            submitBtn.disabled = false;
        }
    });
});