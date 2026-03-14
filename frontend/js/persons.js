let personsList = [];

async function fetchPersons() {
    try {
        const response = await fetch(`${API_BASE}/persons`);
        if (!response.ok) throw new Error('Network response was not ok');
        personsList = await response.json();
    } catch (error) {
        console.error("Chyba při stahování zaměstnanců:", error);
    }
}

function renderPersonsList(filterText = '') {
    const listContainer = document.getElementById('persons-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    // Filter by text (first name or surname)
    const lowerFilter = filterText.toLowerCase();
    const filtered = personsList.filter(p => 
        p.firstName.toLowerCase().includes(lowerFilter) || 
        p.surname.toLowerCase().includes(lowerFilter) ||
        `${p.firstName} ${p.surname}`.toLowerCase().includes(lowerFilter)
    );

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 gap-4 h-full">
                <div class="w-16 h-16 rounded-full bg-[#f0f5ff] flex items-center justify-center text-[#2b6be6] mb-2">
                    <i class="fa-solid fa-user-plus text-3xl"></i>
                </div>
                <div class="text-center">
                    <h3 class="font-bold text-[#1e293b] text-base mb-1">${filterText ? 'Žádné výsledky hledání' : 'Zatím zde nejsou žádní zaměstnanci'}</h3>
                    <p class="text-sm text-slate-500">${filterText ? 'Zkuste změnit hledaný výraz' : 'Přidejte prvního zaměstnance pomocí horního formuláře.'}</p>
                </div>
            </div>
        `;
        return;
    }

    const html = filtered.map(p => {
        const teamHtml = p.department 
            ? `<span class="text-[#1f2937]">${p.department.name}</span>`
            : `<span class="badge badge-danger">Nepřiřazen</span>`;
            
        const buildingHtml = p.building
            ? `<span class="text-[#1f2937]">${p.building.name}</span>`
            : `<span class="badge badge-danger">Neusazen</span>`;
            
        const floorHtml = p.floor
            ? `<span class="text-[#1f2937]">${p.floor.level}. patro</span>`
            : `<span class="badge badge-danger">Neusazen</span>`;

        return `
            <div class="list-item">
                <div class="grid grid-cols-[3fr_2fr_2fr_2fr_120px] gap-6 w-full items-center text-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                            <i class="fa-solid fa-user"></i>
                        </div>
                        <span class="font-medium text-[#1f2937] truncate">${p.firstName} ${p.surname}</span>
                    </div>
                    <div>${teamHtml}</div>
                    <div>${buildingHtml}</div>
                    <div>${floorHtml}</div>
                    <div class="flex justify-end">
                        <button onclick="deletePerson(${p.id})" class="btn btn-danger btn-sm">
                            Smazat zaměstnance
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = html;
    lucide.createIcons();
}

function filterPersons() {
    const searchInput = document.getElementById('search-person');
    if (searchInput) {
        renderPersonsList(searchInput.value);
    }
}

async function createPerson() {
    const firstNameInput = document.getElementById('person-firstname');
    const surnameInput = document.getElementById('person-surname');
    
    const firstName = firstNameInput.value.trim();
    const surname = surnameInput.value.trim();

    if (!firstName || !surname) {
        alert("Vyplňte prosím jméno i příjmení.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/persons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, surname })
        });

        if (response.ok) {
            firstNameInput.value = '';
            surnameInput.value = '';
            await fetchPersons();
            renderPersonsList();
        } else {
            const err = await response.json();
            alert(err.error || "Při přidávání zaměstnance nastala chyba.");
        }
    } catch (error) {
        console.error("Chyba spojení:", error);
        alert("Při přidávání zaměstnance nastala chyba spojení.");
    }
}

let personToDelete = null;

function deletePerson(id) {
    personToDelete = id;
    document.getElementById('modal-delete-person-confirm').classList.remove('hidden');
}

function closePersonDeleteModal() {
    personToDelete = null;
    document.getElementById('modal-delete-person-confirm').classList.add('hidden');
}

async function confirmDeletePerson() {
    if (!personToDelete) return;
    try {
        const response = await fetch(`${API_BASE}/persons/${personToDelete}`, { method: 'DELETE' });
        if (response.ok) {
            await fetchPersons();
            filterPersons(); // Re-apply existing filter
        } else {
            const err = await response.json();
            alert(err.error || "Chyba při mazání.");
        }
    } catch (error) {
        console.error(error);
        alert("Chyba spojení.");
    }
    closePersonDeleteModal();
}

// Initialization for when the view loads
async function initPersonsView() {
    await fetchPersons();
    renderPersonsList();
}

// Global scope exports for inline HTML onclick handlers
window.fetchPersons = fetchPersons;
window.renderPersonsList = renderPersonsList;
window.filterPersons = filterPersons;
window.createPerson = createPerson;
window.deletePerson = deletePerson;
window.closePersonDeleteModal = closePersonDeleteModal;
window.confirmDeletePerson = confirmDeletePerson;
window.initPersonsView = initPersonsView;
