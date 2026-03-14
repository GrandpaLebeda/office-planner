let departmentsList = [];
let availablePersonsList = [];
let editingDepartment = null;
let currentDeptMembers = [];

async function fetchDepartments() {
    try {
        const response = await fetch(`${API_BASE}/departments`);
        if (!response.ok) throw new Error('Network response was not ok');
        departmentsList = await response.json();
    } catch (error) {
        console.error("Chyba při stahování týmů:", error);
    }
}

async function fetchAllPersons() {
    try {
        const response = await fetch(`${API_BASE}/persons`);
        if (!response.ok) throw new Error('Network response was not ok');
        availablePersonsList = await response.json();
    } catch (error) {
        console.error("Chyba při stahování zaměstnanců pro našeptávač:", error);
    }
}

function renderDepartmentsList() {
    const listContainer = document.getElementById('departments-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (departmentsList.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 gap-4 h-full">
                <div class="w-16 h-16 rounded-full bg-[#f0f5ff] flex items-center justify-center text-[#2b6be6] mb-2">
                    <i class="fa-solid fa-users text-3xl"></i>
                </div>
                <div class="text-center">
                    <h3 class="font-bold text-[#1e293b] text-base mb-1">Zatím zde nejsou žádné týmy</h3>
                    <p class="text-sm text-slate-500">Přidejte první tým pomocí horního formuláře.</p>
                </div>
            </div>
        `;
        return;
    }

    const html = departmentsList.map(d => {
        return `
            <div class="list-item">
                <div class="grid grid-cols-[3fr_2fr_180px] gap-6 w-full items-center text-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                            <i class="fa-solid fa-users"></i>
                        </div>
                        <span class="font-medium text-[#1f2937] truncate">${d.name}</span>
                    </div>
                    <div class="text-center"><span class="font-medium text-slate-700">${d.people}</span></div>
                    <div class="flex justify-end gap-3">
                        <button onclick="openDeptSettings(${d.id})" class="btn btn-primary btn-sm">
                            Upravit
                        </button>
                        <button onclick="deleteDept(${d.id})" class="btn btn-danger btn-sm">
                            Smazat
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = html;
    lucide.createIcons();
}

async function createDepartment() {
    const nameInput = document.getElementById('dept-name');
    const name = nameInput.value.trim();

    if (!name || name.length < 2) {
        alert("Název týmu musí mít alespoň 2 znaky.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/departments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            nameInput.value = '';
            await fetchDepartments();
            renderDepartmentsList();
        } else {
            const err = await response.json();
            alert(err.error || "Při přidávání týmu nastala chyba.");
        }
    } catch (error) {
        console.error("Chyba spojení:", error);
        alert("Chyba spojení s API.");
    }
}

// -----------------------------------------------------
// Edit Modal Logic
// -----------------------------------------------------

async function openDeptSettings(id) {
    const d = departmentsList.find(x => x.id === id);
    if (!d) return;

    editingDepartment = d;
    document.getElementById('edit-d-name').value = d.name;

    // Load cooperation dropdown
    const collabSelect = document.getElementById('edit-d-collab');
    const possiblePartners = departmentsList.filter(other => other.id !== id);
    collabSelect.innerHTML = `<option value="">-- Žádný --</option>` +
        possiblePartners.map(p => {
            const isSelected = d.collaboratesWith && d.collaboratesWith.id === p.id ? 'selected' : '';
            return `<option value="${p.id}" ${isSelected}>${p.name}</option>`;
        }).join('');

    await fetchAllPersons();

    // Render initial modal unassigned list
    renderUnassignedPersonsModal('');

    // Pre-filter current members
    currentDeptMembers = availablePersonsList.filter(p => p.department && p.department.id === d.id);
    renderDeptMembers();

    document.getElementById('modal-department-settings').classList.remove('hidden');
}

function closeDeptModal() {
    editingDepartment = null;
    currentDeptMembers = [];
    document.getElementById('modal-department-settings').classList.add('hidden');
}

async function openAddPersonToDeptModal() {
    selectedPersonIdToAdd = null;
    document.getElementById('btn-confirm-add-person').disabled = true;
    
    await fetchAllPersons();

    document.getElementById('modal-add-person-to-dept').classList.remove('hidden');
    renderUnassignedPersonsModal(''); // Reset list
    setTimeout(() => {
        const input = document.getElementById('search-person-add-modal');
        input.value = '';
        input.focus();
    }, 50);
}

function closeAddPersonToDeptModal() {
    document.getElementById('search-person-add-modal').value = '';
    document.getElementById('modal-add-person-to-dept').classList.add('hidden');
}

function renderDeptMembers() {
    const container = document.getElementById('dept-members-list');
    const emptyState = document.getElementById('dept-members-empty');

    if (currentDeptMembers.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        container.innerHTML = currentDeptMembers.map(m => `
            <div class="bg-white px-4 py-2 rounded-lg flex justify-between items-center shadow-sm border border-slate-100">
                <span class="text-sm font-medium text-slate-700">${m.firstName} ${m.surname}</span>
                <button onclick="removePersonFromDeptLocal(${m.id})" class="text-red-400 hover:text-red-600 font-bold" title="Odstranit z týmu">×</button>
            </div>
        `).join('');
    }
}

let selectedPersonIdToAdd = null;

function renderUnassignedPersonsModal(filterText = '') {
    const container = document.getElementById('modal-unassigned-persons-list');
    if (!container) return;

    const unassigned = availablePersonsList.filter(p => !p.department || p.department === "" || p.department === "null");
    const filtered = unassigned.filter(p => {
        const fullName = `${p.firstName} ${p.surname}`.toLowerCase();
        return fullName.includes(filterText.toLowerCase());
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-sm text-slate-500 font-medium">Nenalezeni žádní volní zaměstnanci.</div>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const isSelected = selectedPersonIdToAdd === p.id;
        return `
            <div onclick="selectPersonForAdd(${p.id})" class="px-4 py-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-transparent hover:bg-slate-100'}">
                <div class="w-8 h-8 rounded-full ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'} flex items-center justify-center shrink-0 transition-colors">
                    <i class="fa-solid fa-user text-xs"></i>
                </div>
                <span class="text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-slate-700'}">${p.firstName} ${p.surname}</span>
            </div>
        `;
    }).join('');
}

function selectPersonForAdd(personId) {
    // Toggle selection
    if (selectedPersonIdToAdd === personId) {
        selectedPersonIdToAdd = null;
    } else {
        selectedPersonIdToAdd = personId;
    }
    document.getElementById('search-person-add-modal').value = ''; // clears filter to see choice
    renderUnassignedPersonsModal();
    document.getElementById('btn-confirm-add-person').disabled = (selectedPersonIdToAdd === null);
}

function filterAddPersonModal(text) {
    if(!selectedPersonIdToAdd) {
        renderUnassignedPersonsModal(text);
    }
}

async function confirmAddPersonToDept() {
    if (!editingDepartment || !selectedPersonIdToAdd) return;

    try {
        await fetch(`${API_BASE}/persons/${selectedPersonIdToAdd}/department`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departmentId: editingDepartment.id })
        });

        // Refresh local array
        await fetchAllPersons();
        currentDeptMembers = availablePersonsList.filter(x => x.department && x.department.id === editingDepartment.id);
        renderDeptMembers();

        // In background refresh departments table info (like member count)
        await fetchDepartments();
        renderDepartmentsList();
        
        closeAddPersonToDeptModal();

    } catch (e) { console.error(e); }
}

async function removePersonFromDeptLocal(personId) {
    if (!editingDepartment) return;

    try {
        await fetch(`${API_BASE}/persons/${personId}/department`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departmentId: null }) // Unassign feature we added
        });

        // Refresh local
        await fetchAllPersons();
        currentDeptMembers = availablePersonsList.filter(x => x.department && x.department.id === editingDepartment.id);
        renderDeptMembers();

        await fetchDepartments();
        renderDepartmentsList();

    } catch (e) { console.error(e); }
}

async function saveDepartmentSettings() {
    if (!editingDepartment) return;

    const newName = document.getElementById('edit-d-name').value.trim();
    const collabId = document.getElementById('edit-d-collab').value;

    try {
        // Změna názvu
        if (newName && newName !== editingDepartment.name) {
            await fetch(`${API_BASE}/departments/${editingDepartment.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
        }

        // Změna vazby: Pokud string neni prazdny, je to ID, jinak null
        const partnerBodyId = collabId === "" ? null : Number(collabId);

        // V department API mame put pro collaboration
        // Z puvodniho kodu to bylo reseno trosku divne ale /departments/:id/collaboration umi fungovat
        // Pro null musime udelat check, mozna nam to backend spadlne. 
        // We will call the API anyway
        // Vždy uložíme stav spolupráce — backend umí zpracovat jak nastavení, tak odebrání (null)
        await fetch(`${API_BASE}/departments/${editingDepartment.id}/collaboration`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collaboratesWithId: partnerBodyId })
        });


        closeDeptModal();
        await fetchDepartments();
        renderDepartmentsList();
    } catch (err) {
        console.error(err);
    }
}

// -----------------------------------------------------
// Delete Modal Logic
// -----------------------------------------------------

let deptToDelete = null;

function deleteDept(id) {
    deptToDelete = id;
    document.getElementById('modal-delete-dept-confirm').classList.remove('hidden');
}

function closeDeptDeleteModal() {
    deptToDelete = null;
    document.getElementById('modal-delete-dept-confirm').classList.add('hidden');
}

async function confirmDeleteDept() {
    if (!deptToDelete) return;
    try {
        const response = await fetch(`${API_BASE}/departments/${deptToDelete}`, { method: 'DELETE' });
        if (response.ok) {
            await fetchDepartments();
            renderDepartmentsList();
        } else {
            const err = await response.json();
            alert(err.error || "Chyba při mazání.");
        }
    } catch (error) {
        console.error(error);
        alert("Chyba spojení.");
    }
    closeDeptDeleteModal();
}

// Initialization
async function initDepartmentsView() {
    await fetchDepartments();
    renderDepartmentsList();
}

window.fetchDepartments = fetchDepartments;
window.renderDepartmentsList = renderDepartmentsList;
window.createDepartment = createDepartment;
window.openDeptSettings = openDeptSettings;
window.closeDeptModal = closeDeptModal;
window.openAddPersonToDeptModal = openAddPersonToDeptModal;
window.closeAddPersonToDeptModal = closeAddPersonToDeptModal;
window.filterAddPersonModal = filterAddPersonModal;
window.selectPersonForAdd = selectPersonForAdd;
window.confirmAddPersonToDept = confirmAddPersonToDept;
window.removePersonFromDeptLocal = removePersonFromDeptLocal;
window.saveDepartmentSettings = saveDepartmentSettings;
window.deleteDept = deleteDept;
window.closeDeptDeleteModal = closeDeptDeleteModal;
window.confirmDeleteDept = confirmDeleteDept;
window.initDepartmentsView = initDepartmentsView;
