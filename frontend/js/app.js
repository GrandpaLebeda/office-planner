const API_BASE = 'http://localhost:3000';
let currentView = 'map';
let currentBuildingId = null;
let buildingsList = [];
let editingBuilding = null;

async function init() {
    lucide.createIcons();
    await fetchBuildings();
    if (buildingsList.length > 0) {
        currentBuildingId = buildingsList[0].id;
    }
    // Místo explicitního volání fetchMap initializujeme první pohled
    await switchView('map');
}

async function loadViewContent(view) {
    try {
        const response = await fetch(`views/${view}.html?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        document.getElementById('main-content').innerHTML = html;
    } catch (error) {
        console.error("Chyba při načítání pohledu:", error);
        document.getElementById('main-content').innerHTML = `<div class="text-center py-20 text-red-500">Chyba při načítání pohledu ${view}</div>`;
    }
}

async function switchView(view) {
    currentView = view;
    
    // Updates UI classes
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active', 'text-blue-600', 'bg-white'));
    document.querySelectorAll('.sidebar-item').forEach(el => {
        if (!el.classList.contains('active')) el.classList.add('text-slate-600');
    });
    
    const activeNav = document.getElementById(`nav-${view}`);
    if (activeNav) {
        activeNav.classList.add('active', 'text-blue-600', 'bg-white');
        activeNav.classList.remove('text-slate-600');
    }
    
    const titles = { map: 'Mapa', buildings: 'Správa Budov', departments: 'Správa Týmů', persons: 'Správa Zaměstnanců' };
    document.getElementById('page-title').textContent = titles[view];

    // Load HTML content
    await loadViewContent(view);

    // Call View-specific initializers
    if (view === 'buildings') {
        await fetchBuildings();
        await renderBuildingsList();
    } else if (view === 'map') {
        await fetchBuildings(); // refresh dropdown
        await fetchMap();       // load data
    } else if (view === 'persons') {
        await initPersonsView();
    } else if (view === 'departments') {
        await initDepartmentsView();
    }
    
    lucide.createIcons();
}

window.onload = init;
