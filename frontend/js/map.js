// --- MAP LOGIC ---

async function fetchMap() {
    const selector = document.getElementById('building-selector');
    if (selector) {
        currentBuildingId = selector.value ? parseInt(selector.value) : currentBuildingId;
    }
    if (!currentBuildingId) return;

    try {
        const res = await fetch(`${API_BASE}/map/${currentBuildingId}`);
        const data = await res.json();
        renderMap(data);
    } catch (err) { console.error(err); }
}

function renderMap(data) {
    const container = document.getElementById('building-container');
    if (!container) return;
    
    container.innerHTML = `<h2 class="text-center text-4xl font-bold mb-10 border-b border-slate-100 pb-6 tracking-tight">${data.building.name}</h2>`;
    
    let totalCap = 0;
    let totalOcc = 0;

    const floors = [...data.floors].sort((a, b) => a.level - b.level);
    floors.forEach(floor => {
        totalCap += floor.capacity;
        totalOcc += floor.occupied;
        const percent = Math.min((floor.occupied / floor.capacity) * 100, 100);
        const percentSafe = isNaN(percent) ? 0 : percent;

        const floorEl = document.createElement('div');
        floorEl.className = 'mb-10 last:mb-0';

        // Progress bar as div (progress element doesn't style well in Tailwind CDN)
        const progressColor = percentSafe > 80 ? '#f03e3e' : percentSafe > 50 ? '#f59f00' : '#40c057';

        // Build floor teams HTML
        const teamsHtml = floor.departments.map(d => `
            <div class="bg-[#2b6be6] text-white px-4 py-2 rounded-lg flex justify-between items-center shadow-sm" data-dept-id="${d.id}">
                <span class="text-xs font-bold">${d.name} <span class="font-normal opacity-80 ml-1">(${d.size} členů)</span></span>
                <button data-remove-dept="${d.id}" class="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-md transition-colors uppercase tracking-wider shrink-0" title="Odebrat tým z patra">Odebrat</button>
            </div>
        `).join('');

        floorEl.innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <span class="font-bold text-sm whitespace-nowrap min-w-[120px]">${floor.level}. Patro <span class="text-slate-400 font-medium text-[11px]">(${floor.capacity} míst)</span></span>
                <div class="flex-1 flex items-center gap-3">
                    <div class="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-700" style="width: ${percentSafe}%; background-color: ${progressColor};"></div>
                    </div>
                    <span class="text-[11px] font-bold text-slate-500 w-10 text-right">${percentSafe > 0 ? percentSafe.toFixed(1) : 0}%</span>
                </div>
            </div>
            <div class="floor-drop-zone min-h-[52px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-2 flex flex-col gap-2 transition-all" data-floor-id="${floor.id}">
                ${teamsHtml}
            </div>
        `;

        // Attach drag/drop events via addEventListener (more reliable than inline)
        const dropZone = floorEl.querySelector('.floor-drop-zone');
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('bg-blue-50', 'border-blue-400');
        });
        dropZone.addEventListener('dragleave', (e) => {
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('bg-blue-50', 'border-blue-400');
            }
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('bg-blue-50', 'border-blue-400');
            handleDrop(e, floor.id);
        });

        // Remove buttons via event delegation
        floorEl.querySelectorAll('[data-remove-dept]').forEach(btn => {
            btn.addEventListener('click', () => removeFromFloor(Number(btn.dataset.removeDept)));
        });

        container.appendChild(floorEl);
    });

    // Update Stats
    document.getElementById('stat-capacity').textContent = totalCap;
    document.getElementById('stat-people').textContent = totalOcc;
    document.getElementById('stat-percent').textContent = totalCap > 0 ? ((totalOcc / totalCap) * 100).toFixed(1) + '%' : '0%';

    // Render Unassigned
    const unList = document.getElementById('unassigned-list');
    if (!unList) return;
    
    unList.innerHTML = '';
    if (data.unassignedDepartments.length === 0) {
        unList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 gap-4">
                <div class="h-16 w-16 mb-2 rounded-full bg-[#f0fdf4] flex items-center justify-center text-[#22c55e] mx-auto">
                    <i class="fa-solid fa-check text-3xl"></i>
                </div>
                <p class="text-sm font-medium text-slate-500">Všechny týmy jsou usazené</p>
            </div>
        `;
    } else {
        data.unassignedDepartments.forEach(dept => {
            const el = document.createElement('div');
            el.className = 'bg-white border border-slate-100 rounded-xl p-4 flex justify-between items-center cursor-grab active:cursor-grabbing hover:shadow-md transition-all group';
            el.draggable = true;
            el.innerHTML = `
                <div class="flex flex-col gap-1">
                    <span class="font-bold text-[#1e293b] text-sm">${dept.name}</span>
                    ${dept.collaboratesWith ? `
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] text-red-400 font-bold">${dept.collaboratesWith.name}</span>
                            <i class="fa-solid fa-heart text-red-500 text-[10px]"></i>
                        </div>
                    ` : ''}
                </div>
                <div class="flex items-center gap-1 text-blue-600 font-bold">
                    <span class="text-sm">${dept.size}</span>
                    <i class="fa-solid fa-user text-xs"></i>
                </div>
            `;
            el.ondragstart = (e) => e.dataTransfer.setData('deptId', dept.id);
            unList.appendChild(el);
        });
    }
    lucide.createIcons();
}

async function handleDrop(e, floorId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const deptId = e.dataTransfer.getData('deptId');
    if (!deptId) return;

    try {
        const res = await fetch(`${API_BASE}/assignments/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departmentId: parseInt(deptId), targetFloorId: floorId })
        });
        if (res.ok) await fetchMap();
        else {
            const err = await res.json();
            alert(err.error || "Chyba při přesunu");
        }
    } catch (err) { console.error(err); }
}

async function removeFromFloor(deptId) {
    try {
        const res = await fetch(`${API_BASE}/assignments/${deptId}/placement`, {
            method: 'DELETE'
        });
        if (res.ok) await fetchMap();
        else {
            const err = await res.json();
            alert(err.error || "Chyba při odebírání týmu");
        }
    } catch (err) { console.error(err); }
}

async function runAutoAllocation() {
    await fetch(`${API_BASE}/assignments/run`, { method: 'POST' });
    await fetchMap();
}

async function clearMap() {
    try {
        const res = await fetch(`${API_BASE}/assignments/clear`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || `Chyba serveru (${res.status})`);
            return;
        }
        await fetchMap();
    } catch (err) {
        console.error('clearMap error:', err);
        alert('Nepodařilo se připojit k serveru.');
    }
}

// Global scope exports for inline HTML onclick handlers
window.fetchMap = fetchMap;
window.renderMap = renderMap;
window.handleDrop = handleDrop;
window.removeFromFloor = removeFromFloor;
window.runAutoAllocation = runAutoAllocation;
window.clearMap = clearMap;
