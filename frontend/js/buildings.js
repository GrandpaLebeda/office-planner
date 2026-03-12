// --- BUILDINGS LOGIC ---

async function fetchBuildings() {
    try {
        const res = await fetch(`${API_BASE}/buildings`);
        if (!res.ok) throw new Error("Chyba při načítání seznamu budov");
        const data = await res.json();
        buildingsList = Array.isArray(data) ? data : [];
        const selector = document.getElementById('building-selector');
        if (selector) {
            selector.innerHTML = buildingsList.map(b => `<option value="${b.id}" ${b.id === currentBuildingId ? 'selected' : ''}>${b.name}</option>`).join('');
        }
    } catch (err) { 
        console.error(err);
        buildingsList = []; // Zabraňuje TypeErroru
    }
}

async function createBuilding() {
    const name = document.getElementById('new-b-name').value;
    const floors = parseInt(document.getElementById('new-b-floors').value);
    if (!name || isNaN(floors) || floors < 1) return alert("Vyplňte název a platný počet pater");

    try {
        const res = await fetch(`${API_BASE}/buildings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            const newBuilding = await res.json();
            const newId = newBuilding.id;
            for (let i = 1; i <= floors; i++) {
                await fetch(`${API_BASE}/buildings/${newId}/floors`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ level: i, capacity: 20 })
                });
            }
            document.getElementById('new-b-name').value = '';
            document.getElementById('new-b-floors').value = '';
            await fetchBuildings();
            await renderBuildingsList();
        }
    } catch (err) { console.error(err); }
}

async function renderBuildingsList() {
    const container = document.getElementById('buildings-table');
    if (!container) return;

    if (buildingsList.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 gap-4 opacity-60">
                <img src="https://api.iconify.design/flat-color-icons:department.svg" class="w-20" alt="empty">
                <div class="text-center">
                    <p class="font-bold">Zatím zde nejsou žádné budovy</p>
                    <p class="text-xs">Přidejte první budovu pomocí horního formuláře.</p>
                </div>
            </div>
        `;
        return;
    }

    // Potřebujeme načíst kapacity pro zobrazení
    container.innerHTML = `
        <div class="grid grid-cols-[1fr,150px,150px,200px] gap-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            <span>Název</span>
            <span class="text-center">Počet pater</span>
            <span class="text-center">Kapacita</span>
            <span></span>
        </div>
    `;

    for (const b of buildingsList) {
        let totalCap = 0;
        let floorCount = 0;
        try {
            const floorRes = await fetch(`${API_BASE}/buildings/${b.id}/floors`);
            if (floorRes.ok) {
                const floorData = await floorRes.json();
                const floorsArray = floorData.floors || [];
                floorCount = floorsArray.length;
                totalCap = floorsArray.reduce((acc, f) => acc + f.capacity, 0);
            }
        } catch (err) {
            console.error(`Chyba načítání pater pro budovu ${b.id}`, err);
        }

        const row = document.createElement('div');
        row.className = 'bg-[#f8f9fa] rounded-xl p-4 flex items-center justify-between hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-100';
        row.innerHTML = `
            <div class="flex items-center gap-4 flex-1">
                <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white"><i data-lucide="building-2" size="20"></i></div>
                <span class="font-bold text-lg">${b.name}</span>
            </div>
            <div class="w-[150px] text-center font-bold text-slate-700">${floorCount}</div>
            <div class="w-[150px] text-center font-bold text-slate-700">${totalCap}</div>
            <div class="w-[200px] flex justify-end gap-3">
                <button onclick="openSettings(${b.id})" class="bg-[#2b6be6] text-white px-5 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">Upravit</button>
                <button onclick="deleteBuilding(${b.id})" class="bg-[#ff4d4d] text-white px-5 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-red-600 transition-colors">Smazat</button>
            </div>
        `;
        container.appendChild(row);
    }
    lucide.createIcons();
}

async function openSettings(id) {
    const b = buildingsList.find(x => x.id === id);
    editingBuilding = b;
    document.getElementById('edit-b-name').value = b.name;
    
    const floorRes = await fetch(`${API_BASE}/buildings/${b.id}/floors`);
    const data = await floorRes.json();
    
    const floors = data.floors || [];
    const maxLevel = floors.length > 0 ? Math.max(...floors.map(f => f.level)) : 0;

    const list = document.getElementById('modal-floors-list');
    list.innerHTML = floors.map(f => `
        <div class="flex items-center gap-4 mb-2">
            <span class="text-sm font-bold w-1/3">${f.level}. patro</span>
            <div class="flex-1 flex items-center gap-2">
                <input type="number" value="${f.capacity}" data-floor-id="${f.id}" class="floor-cap-input w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-500">
                ${f.level === maxLevel ? `<button onclick="removeFloor(${b.id}, ${f.id}, ${f.level})" class="text-red-500 hover:text-red-700 font-bold px-2 py-1 text-lg mb-1" title="Smazat patro">×</button>` : '<div class="w-8"></div>'}
            </div>
        </div>
    `).join('');
    
    document.getElementById('modal-building-settings').classList.remove('hidden');
}

let buildingToDelete = null;

function deleteBuilding(id) {
    buildingToDelete = id;
    document.getElementById('modal-delete-confirm').classList.remove('hidden');
}

function closeDeleteModal() {
    buildingToDelete = null;
    document.getElementById('modal-delete-confirm').classList.add('hidden');
}

async function confirmDeleteBuilding() {
    if (!buildingToDelete) return;

    try {
        const res = await fetch(`${API_BASE}/buildings/${buildingToDelete}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Chyba při mazání budovy.");
        }
    } catch (err) {
        alert(err.message);
    } finally {
        closeDeleteModal();
        await fetchBuildings();
        await renderBuildingsList();
    }
}

function closeModal() {
    document.getElementById('modal-building-settings').classList.add('hidden');
}

async function saveBuildingSettings() {
    if (!editingBuilding) return;

    const newName = document.getElementById('edit-b-name').value.trim();
    if (newName && newName !== editingBuilding.name) {
        try {
            await fetch(`${API_BASE}/buildings/${editingBuilding.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
        } catch(err) { console.error("Chyba při přejmenování", err); }
    }

    const inputs = document.querySelectorAll('.floor-cap-input');
    for (const input of inputs) {
        const floorId = input.dataset.floorId;
        const capacity = parseInt(input.value);
        if(!isNaN(capacity)) {
           await fetch(`${API_BASE}/floors/${floorId}`, {
               method: 'PUT',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ capacity })
           });
        }
    }
    closeModal();
    await fetchBuildings();
    await renderBuildingsList();
}

async function addFloorToEdit() {
    if(!editingBuilding) return;
    const list = document.getElementById('modal-floors-list');
    const floorsCount = list.children.length; // Approximate check based on rendered rows
    const nextLevel = floorsCount + 1;
    
    try {
        const res = await fetch(`${API_BASE}/buildings/${editingBuilding.id}/floors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: nextLevel, capacity: 20 }) // Default capacity 20
        });
        
        if (res.ok) {
            // Re-render modal inputs smoothly
            await openSettings(editingBuilding.id);
            await fetchBuildings();
            await renderBuildingsList();
        } else {
            const err = await res.json();
            alert(err.error || "Při přidávání patra nastala chyba.");
        }
    } catch(err) {
        console.error(err);
        alert("Při přidávání patra nastala chyba spojení.");
    }
}

async function removeFloor(buildingId, floorId, level) {
    try {
        await fetch(`${API_BASE}/floors/${floorId}`, { method: 'DELETE' });
        await openSettings(buildingId); // Refresh modal view
        await fetchBuildings();
        await renderBuildingsList();
    } catch(err) {
        console.error(err);
    }
}

// Global scope exports for inline HTML onclick handlers
window.fetchBuildings = fetchBuildings;
window.createBuilding = createBuilding;
window.openSettings = openSettings;
window.deleteBuilding = deleteBuilding;
window.closeModal = closeModal;
window.saveBuildingSettings = saveBuildingSettings;
window.addFloorToEdit = addFloorToEdit;
window.removeFloor = removeFloor;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteBuilding = confirmDeleteBuilding;
