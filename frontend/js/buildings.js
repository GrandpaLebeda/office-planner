
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
        buildingsList = [];
    }
}

async function createBuilding() {
    const name = document.getElementById('new-b-name').value;
    const floors = parseInt(document.getElementById('new-b-floors').value);
    if (!name || isNaN(floors) || floors < 1) {
        showToast("Vyplňte prosím název a platný počet pater.", "error");
        return;
    }

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
            showToast("Budova byla úspěšně vytvořena.", "success");
        } else {
            const err = await res.json();
            showToast(err.error || "Při vytváření budovy nastala chyba.", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Chyba při komunikaci se serverem.", "error");
    }
}

async function renderBuildingsList() {
    const container = document.getElementById('buildings-table');
    if (!container) return;

    if (buildingsList.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 gap-4 h-full">
                <div class="w-16 h-16 rounded-full bg-[#f0f5ff] flex items-center justify-center text-[#2b6be6] mb-2">
                    <i class="fa-solid fa-city text-3xl"></i>
                </div>
                <div class="text-center">
                    <h3 class="font-bold text-[#1e293b] text-base mb-1">Zatím zde nejsou žádné budovy</h3>
                    <p class="text-sm text-slate-500">Přidejte první budovu pomocí horního formuláře.</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="list-header list-header-buildings">
            <span>Název</span>
            <span>Počet pater</span>
            <span>Kapacita</span>
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
        row.className = 'list-item';
        row.innerHTML = `
            <div class="list-row-buildings">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <i class="fa-solid fa-city"></i>
                    </div>
                    <span class="font-medium text-[#1f2937] truncate">${b.name}</span>
                </div>
                <div><span class="font-medium text-slate-700">${floorCount}</span></div>
                <div><span class="font-medium text-slate-700">${totalCap}</span></div>
                <div class="flex justify-end gap-3">
                    <button onclick="openSettings(${b.id})" class="btn btn-primary btn-sm">Upravit</button>
                    <button onclick="deleteBuilding(${b.id})" class="btn btn-danger btn-sm">Smazat</button>
                </div>
            </div>
        `;
        container.appendChild(row);
    }
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
            <span class="text-sm font-bold w-1/3 text-[#1e293b]">${f.level}. patro</span>
            <div class="flex-1 flex items-center gap-2">
                <input type="number" value="${f.capacity}" data-floor-id="${f.id}" class="floor-cap-input w-full border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-500 font-medium">
                ${f.level === maxLevel ? `<button onclick="removeFloor(${b.id}, ${f.id}, ${f.level})" class="text-red-500 hover:text-red-700 w-8 h-8 flex items-center justify-center shrink-0" title="Smazat patro"><i class="fa-solid fa-xmark text-lg"></i></button>` : '<div class="w-8 shrink-0"></div>'}
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
            showToast(err.error || "Chyba při mazání budovy.", "error");
            return;
        }
        showToast("Budova byla smazána.", "success");
    } catch (err) {
        showToast("Chyba při komunikaci se serverem.", "error");
        console.error(err);
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
        } catch (err) { console.error("Chyba při přejmenování", err); }
    }

    const inputs = document.querySelectorAll('.floor-cap-input');
    for (const input of inputs) {
        const floorId = input.dataset.floorId;
        const capacity = parseInt(input.value);
        if (!isNaN(capacity)) {
            await fetch(`${API_BASE}/floors/${floorId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ capacity })
            });
        }
    }
    closeModal();
    showToast("Nastavení budovy bylo uloženo.", "success");
    await fetchBuildings();
    await renderBuildingsList();
}

async function addFloorToEdit() {
    if (!editingBuilding) return;
    const list = document.getElementById('modal-floors-list');
    const floorsCount = list.children.length;
    const nextLevel = floorsCount + 1;

    try {
        const res = await fetch(`${API_BASE}/buildings/${editingBuilding.id}/floors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: nextLevel, capacity: 20 })
        });

        if (res.ok) {
            await openSettings(editingBuilding.id);
            await fetchBuildings();
            await renderBuildingsList();
            showToast("Nové patro bylo úspěšně přidáno.", "success");
        } else {
            const err = await res.json();
            showToast(err.error || "Při přidávání patra nastala chyba.", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Při přidávání patra nastala chyba spojení.", "error");
    }
}

async function removeFloor(buildingId, floorId, level) {
    try {
        await fetch(`${API_BASE}/floors/${floorId}`, { method: 'DELETE' });
        await openSettings(buildingId);
        await fetchBuildings();
        await renderBuildingsList();
        showToast("Patro bylo úspěšně odebráno.", "success");
    } catch (err) {
        console.error(err);
        showToast("Při mazání patra došlo k chybě.", "error");
    }
}

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
