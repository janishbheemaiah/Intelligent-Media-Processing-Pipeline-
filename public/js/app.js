document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('isLoggedIn') !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  // Tab Navigation
  const navLinks = document.querySelectorAll('.nav-links li');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');
  
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      // Remove active class
      navLinks.forEach(l => l.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      
      // Add active class
      link.classList.add('active');
      const target = link.getAttribute('data-tab');
      document.getElementById(`${target}-tab`).classList.add('active');
      
      // Update Title
      if (target === 'upload') pageTitle.innerText = 'Live Analysis Dashboard';
      if (target === 'analytics') {
        pageTitle.innerText = 'System Analytics';
        fetchAnalytics();
      }
      if (target === 'settings') pageTitle.innerText = 'System Settings';
    });
  });

  // File Upload Logic
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const progressBar = document.getElementById('progress');
  const resultsContainer = document.getElementById('results-container');
  
  // Drag and Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#2563eb';
    dropzone.style.background = 'rgba(59, 130, 246, 0.2)';
  });
  
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#3b82f6';
    dropzone.style.background = 'rgba(59, 130, 246, 0.05)';
  });
  
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#3b82f6';
    dropzone.style.background = 'rgba(59, 130, 246, 0.05)';
    
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleUpload(e.target.files[0]);
    }
  });

  async function handleUpload(file) {
    if (!file) return;

    // UI Reset
    dropzone.style.display = 'none';
    statusContainer.style.display = 'block';
    resultsContainer.style.display = 'none';
    statusText.innerText = 'Uploading to Server...';
    progressBar.style.width = '20%';

    const formData = new FormData();
    formData.append('image', file);

    try {
      const uploadRes = await fetch('/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      
      if (uploadData.error) throw new Error(uploadData.error);
      
      const jobId = uploadData.id;
      progressBar.style.width = '40%';
      statusText.innerText = 'Queued for Analysis...';

      // Poll for status
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/status/${jobId}`);
          const statusData = await statusRes.json();
          
          if (statusData.status === 'processing') {
            statusText.innerText = 'Running AI Models (OCR, Blur detection)...';
            progressBar.style.width = '70%';
          } 
          else if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(poll);
            progressBar.style.width = '100%';
            statusText.innerText = `Analysis ${statusData.status}!`;
            
            setTimeout(() => {
              fetchResults(jobId);
            }, 500);
          }
        } catch (err) {
          console.error(err);
        }
      }, 1500);

    } catch (err) {
      statusText.innerText = 'Error: ' + err.message;
      document.getElementById('status-spinner').style.display = 'none';
      progressBar.style.background = '#ef4444';
      setTimeout(() => { resetUploadUI(); }, 3000);
    }
  }

  async function fetchResults(jobId) {
    statusContainer.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    try {
      const resultsRes = await fetch(`/results/${jobId}`);
      const data = await resultsRes.json();
      
      // Update Filename
      const filenameEl = document.getElementById('image-filename');
      if (filenameEl) {
        filenameEl.innerText = data.filename || 'Unknown File';
      }

      // Update Confidence
      const confidencePercent = Math.round((data.confidence || 0) * 100);
      document.getElementById('confidence-val').innerText = `${confidencePercent}%`;
      
      const badge = document.getElementById('confidence-badge');
      if (confidencePercent > 80) {
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = 'var(--success)';
        badge.style.borderColor = 'var(--success)';
      } else if (confidencePercent > 50) {
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
        badge.style.color = 'var(--warning)';
        badge.style.borderColor = 'var(--warning)';
      } else {
        badge.style.background = 'rgba(239, 68, 68, 0.2)';
        badge.style.color = 'var(--danger)';
        badge.style.borderColor = 'var(--danger)';
      }

      // Update Decision Banner
      const decisionEl = document.getElementById('overall-decision');
      decisionEl.innerText = data.overallResult;
      decisionEl.style.color = data.overallResult === 'Accepted' ? 'var(--success)' : 'var(--danger)';
      decisionEl.style.borderColor = data.overallResult === 'Accepted' ? 'var(--success)' : 'var(--danger)';
      decisionEl.style.border = '1px solid';

      // Build Metrics Grid
      const metricsGrid = document.getElementById('metrics-grid');
      metricsGrid.innerHTML = ''; // Clear previous

      const analysis = data.analysis || {};
      
      const metrics = [
        { title: 'OCR Extraction', value: analysis.ocr?.vehicleNumber || 'Failed', type: analysis.ocr?.vehicleNumber ? 'success' : 'warning' },
        { title: 'Format Validation', value: analysis.numberPlateValidation?.valid ? 'Valid Indian Format' : (analysis.ocr?.vehicleNumber ? 'Invalid Format' : 'N/A'), type: analysis.numberPlateValidation?.valid ? 'success' : (analysis.ocr?.vehicleNumber ? 'danger' : 'warning') },
        { title: 'Blur Score', value: `${(analysis.blur?.score || 0).toFixed(2)}`, type: analysis.blur?.detected ? 'danger' : 'success' },
        { title: 'Brightness Score', value: `${(analysis.brightness?.score || 0).toFixed(2)}`, type: analysis.brightness?.detected ? 'danger' : 'success' },
        { title: 'Dimensions', value: analysis.dimensions?.valid ? 'OK' : 'Too Small', type: analysis.dimensions?.valid ? 'success' : 'danger' },
        { title: 'Photo of Photo', value: analysis.photoOfPhoto?.detected ? 'Detected' : 'Clear', type: analysis.photoOfPhoto?.detected ? 'danger' : 'success' },
        { title: 'Metadata', value: analysis.metadata?.valid ? 'Intact' : 'Missing EXIF', type: analysis.metadata?.valid ? 'success' : 'danger' },
        { title: 'Editing Check', value: analysis.editing?.suspicious ? 'Suspicious' : 'Clean', type: analysis.editing?.suspicious ? 'danger' : 'success' }
      ];

      metrics.forEach(m => {
        const color = m.type === 'success' ? 'var(--success)' : 'var(--danger)';
        const card = document.createElement('div');
        card.style.background = 'rgba(0,0,0,0.2)';
        card.style.padding = '15px';
        card.style.borderRadius = '8px';
        card.style.borderTop = `3px solid ${color}`;
        
        card.innerHTML = `
          <h5 style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; margin-bottom: 5px;">${m.title}</h5>
          <div style="font-weight: 600; font-size: 1.1rem; color: ${color};">${m.value}</div>
        `;
        metricsGrid.appendChild(card);
      });

      // Update Issues List
      const issuesList = document.getElementById('issues-list');
      issuesList.innerHTML = '';
      
      if (data.issues && data.issues.length > 0) {
        data.issues.forEach(issue => {
          issuesList.innerHTML += `<div class="issue-item issue-error"><i class="fa-solid fa-circle-exclamation"></i> <span>${issue}</span></div>`;
        });
      } else {
        issuesList.innerHTML = `<div class="issue-item issue-success"><i class="fa-solid fa-check"></i> <span>All checks passed. High quality image.</span></div>`;
      }

      // Add a reset button
      issuesList.innerHTML += `<button class="btn primary-btn mt-4" onclick="location.reload()">Process Another</button>`;

    } catch (error) {
      console.error(error);
    }
  }

  function resetUploadUI() {
    dropzone.style.display = 'block';
    statusContainer.style.display = 'none';
    progressBar.style.width = '0%';
    document.getElementById('status-spinner').style.display = 'block';
    progressBar.style.background = 'var(--primary)';
    fileInput.value = '';
  }

  // Analytics Logic
  let chartInstance = null;

  async function fetchAnalytics() {
    try {
      const res = await fetch('/analytics');
      const data = await res.json();
      
      document.getElementById('kpi-total').innerText = data.total;
      document.getElementById('kpi-accepted').innerText = data.accepted;
      document.getElementById('kpi-rejected').innerText = data.rejected;
      document.getElementById('kpi-confidence').innerText = `${data.avgConfidence}%`;

      renderChart(data.accepted, data.rejected, data.pending);
    } catch (err) {
      console.error("Error fetching analytics", err);
    }
  }

  function renderChart(accepted, rejected, pending) {
    const ctx = document.getElementById('acceptanceChart').getContext('2d');
    
    if (chartInstance) {
      chartInstance.destroy();
    }
    
    // Set text colors for Chart.js
    Chart.defaults.color = '#94a3b8';

    chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Accepted', 'Rejected', 'Pending'],
        datasets: [{
          data: [accepted, rejected, pending],
          backgroundColor: [
            '#10b981', // success
            '#ef4444', // danger
            '#3b82f6'  // primary
          ],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          }
        },
        cutout: '70%'
      }
    });
  }
});
