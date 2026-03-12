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
            <div class="flex flex-col items-center justify-center p-12 text-center h-full gap-4">
                <div class="h-16 w-32 flex items-center justify-center">
                    <img src="https://api.iconify.design/fluent-emoji:people-hugging.svg" class="h-full object-contain drop-shadow" alt="empty">
                </div>
                <div>
                    <h3 class="font-bold text-[#1e293b] text-base mb-1">Zatím zde nejsou žádné týmy</h3>
                    <p class="text-sm text-slate-500">Přidejte první tým pomocí horního formuláře.</p>
                </div>
            </div>
        `;
        return;
    }

    const html = departmentsList.map(d => {
        return `
            <div class="bg-[#f8f9fa] rounded-xl p-4 flex items-center shadow-sm border border-slate-200/60 mb-3 justify-between">
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <i data-lucide="users-2" class="w-4 h-4 text-blue-700"></i>
                    </div>
                    <span class="font-bold text-[#1e293b]">${d.name} <span class="text-slate-500 text-xs font-normal ml-2">(${d.people} členů)</span></span>
                </div>
                <div class="flex justify-end gap-3 w-48">
                    <button onclick="openDeptSettings(${d.id})" class="bg-[#2b6be6] hover:bg-blue-700 text-white px-5 py-1.5 rounded-full text-xs font-bold transition-colors shadow-sm">
                        Upravit
                    </button>
                    <button onclick="deleteDept(${d.id})" class="bg-red-500 hover:bg-red-600 text-white px-5 py-1.5 rounded-full text-xs font-bold transition-colors shadow-sm">
                        Smazat
                    </button>
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

    // Prepare add person datalist
    await fetchAllPersons();
    const dataList = document.getElementById('persons-datalist');
    // Filtr: jen ti lidi co nejsou zarazeni nikam
    const unassignedPersons = availablePersonsList.filter(p => !p.department);
    dataList.innerHTML = unassignedPersons.map(p =>
        `<option value="${p.firstName} ${p.surname}" data-id="${p.id}">`
    ).join('');

    // Pre-filter current members
    currentDeptMembers = availablePersonsList.filter(p => p.department && p.department.id === d.id);
    renderDeptMembers();

    document.getElementById('modal-department-settings').classList.remove('hidden');
}

function closeDeptModal() {
    editingDepartment = null;
    currentDeptMembers = [];
    document.getElementById('search-person-add').value = '';
    document.getElementById('modal-department-settings').classList.add('hidden');
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

async function addPersonToDept() {
    if (!editingDepartment) return;

    const searchInput = document.getElementById('search-person-add');
    const val = searchInput.value.trim().toLowerCase();

    if (!val) return;

    // Find the person object from the list
    const p = availablePersonsList.find(x => `${x.firstName} ${x.surname}`.toLowerCase() === val);
    if (!p) {
        alert("Zaměstnanec s tímto jménem nenalezen. Musíte vybrat existujícího.");
        return;
    }

    if (currentDeptMembers.find(x => x.id === p.id)) {
        alert("Zaměstnanec je již členem tohoto týmu.");
        return;
    }

    if (p.department && p.department.id !== editingDepartment.id) {
        alert(`Tento zaměstnanec je již zařazen v oddělení "${p.department.name}". Zaměstnanec může být pouze v jednom týmu současně. Nejdříve ho z něj musíte odebrat.`);
        return;
    }

    try {
        // Send updates directly via PUT /persons/:id/department
        await fetch(`${API_BASE}/persons/${p.id}/department`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departmentId: editingDepartment.id })
        });

        // Refresh local array
        searchInput.value = '';
        await fetchAllPersons();
        currentDeptMembers = availablePersonsList.filter(x => x.department && x.department.id === editingDepartment.id);
        renderDeptMembers();

        // In background refresh departments table info (like member count)
        await fetchDepartments();
        renderDepartmentsList();

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
window.addPersonToDept = addPersonToDept;
window.removePersonFromDeptLocal = removePersonFromDeptLocal;
window.saveDepartmentSettings = saveDepartmentSettings;
window.deleteDept = deleteDept;
window.closeDeptDeleteModal = closeDeptDeleteModal;
window.confirmDeleteDept = confirmDeleteDept;
window.initDepartmentsView = initDepartmentsView;
