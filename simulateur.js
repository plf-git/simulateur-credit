document.addEventListener('DOMContentLoaded', () => {
    window.scrollTo(0, 0);

    const form = document.getElementById('loanForm');
    if (!form) {
        console.error('Formulaire introuvable');
        return;
    };

    window.IDS_RESULTATS = ['resultat', 'graphique-container'];
    window.IDs_CALCULES = ['mensualite', 'interetsTotal', 'coutTotal'];
    
    IDs_CALCULES.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    form.addEventListener('submit', handleSubmit);

    let recalcTimeout = null;

    const contraintes = {
        montant: { min: 0, max: 100000000, step: 1},
        taux: { min: 0, max: 50, step: 0.01 },
        duree: { min: 1, max: 600, step: 1}
    };

    ['montant', 'taux', 'duree'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('input', () => {
            setCalculatedFieldsStale(true);
            setResultatsVisible(false);

            clearTimeout(recalcTimeout);
            recalcTimeout = setTimeout(simulateRecalculation, 1000);
        });

        input.addEventListener('blur', () => {
            const { min, max, step } = contraintes[id];
            let value = parseFloat(input.value);
            if (isNaN(value)) return;

            const precision = (step.toString().split('.')[1] || "").length;
            value = Math.min(Math.max(value, min), max);
            value = Math.round((value - min) / step) * step + min;
            
            input.value = value.toFixed(precision);
        });
    });
});

let chartInstance = null;

function setCalculatedFieldsStale(isStale) {
    IDs_CALCULES.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('stale', isStale);
        }
    });
}

function setResultatsVisible(isVisible) {
    IDS_RESULTATS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('visible', isVisible);
    });
}

// --- Simule la soumission du formulaire pour recalculer ---
function simulateRecalculation() {
    // On récupère les valeurs actuelles
    const montant = parseFloat(document.getElementById('montant').value);
    const taux = parseFloat(document.getElementById('taux').value);
    const duree = parseInt(document.getElementById('duree').value);

    // On vérifie que c’est valide avant de lancer le calcul
    if (montant > 0 && taux >= 0 && duree > 0) {
        handleCalculation(montant, taux, duree);
        return true;
    }
    return false;
}

// --- Extraction de la logique de calcul pour réutilisation ---
function handleCalculation(montant, taux, duree) {
    const echeancier = calculerEcheancier(montant, taux, duree);

    window.dernierEcheancier = echeancier;
    document.getElementById('resultat').innerHTML = afficherTableau(echeancier);
    afficherGraphique(echeancier);
    setResultatsVisible(true);

    const mensualite = echeancier[0]?.mensualite ?? 0;
    const interetsTotaux = echeancier.reduce((acc, l) => acc + l.interet, 0);
    const coutTotal = montant + interetsTotaux;

    // Met à jour les champs calculés et enlève la classe stale
    [
      {id: 'mensualite', val: mensualite, color: '#4f46e5', background: '#eef2ff'},
      {id: 'interetsTotal', val: interetsTotaux, color: '#f59e0b', background: '#fff7db'},
      {id: 'coutTotal', val: coutTotal, color: '#10b981', background: '#d9f6e9'}
    ].forEach(({id, val, color, background}) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            el.classList.remove('stale');
            el.style.color = color;
            el.style.backgroundColor = background;
        }
    });

    // Scroll doux après affichage des résultats
    const form = document.getElementById('loanForm');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'end'});
    }
}

// --- Calcul de l'échéancier ---
function calculerEcheancier(montant, tauxAnnuel, dureeMois) {
    const tauxMensuel = tauxAnnuel / 12 / 100;
    const mensualite = tauxMensuel === 0
        ? montant / dureeMois
        : montant * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeMois));

    const tableau = [];
    let capitalRestant = montant;
    let cumulInteret = 0;
    let cumulCapital = 0;

    for (let mois = 1; mois <= dureeMois; mois++) {
        const interet = capitalRestant * tauxMensuel;
        const principal = mensualite - interet;
        capitalRestant -= principal;
        cumulInteret += interet;
        cumulCapital += principal;

        tableau.push({
            mois,
            mensualite,
            interet,
            principal,
            capitalRestant: Math.max(0,capitalRestant),
            cumulInteret,
            cumulCapital,
            cumulTotal: cumulCapital + cumulInteret
        });
    }
    return tableau;
}

// --- Affichage du tableau ---
function afficherTableau(tableau) {
    const format = val => val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    const rows = tableau.map(ligne => `
        <tr>
            <td>${ligne.mois}</td>
            <td>${format(ligne.mensualite)}</td>
            <td>${format(ligne.principal)}</td>
            <td>${format(ligne.interet)}</td>
            <td style="color:#f59e0b;">${format(ligne.cumulInteret)}</td>
            <td style="color:#10b981;">${format(ligne.cumulTotal)}</td>
            <td style="color:#4f46e5;">${format(ligne.capitalRestant)}</td>
            </tr>
    `).join('');

    return `
        <div class="table-wrapper">
            <div class="table-header">
                <h2 class="table-title">Échéancier de remboursement</h2>
                <button class="csv-button" onclick="telechargerCSV()">📥 Télécharger en CSV</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Mois</th>
                        <th>Mensualité (€)</th>
                        <th>Capital (€)</th>
                        <th>Intérêts (€)</th>
                        <th style="color:#f59e0b;">Cumul intérêts (€)</th>
                        <th style="color:#10b981;">Coût total (€)</th>
                        <th style="color:#4f46e5;">Restant dû (€)</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// --- Affichage du graphique ---
function afficherGraphique(tableau) {
    const labels = tableau.map(l => l.mois);
    const capitalRestant = tableau.map(l => l.capitalRestant);
    const interetsCumul = tableau.map(l => l.cumulInteret);
    const cumulTotal = tableau.map(l => l.cumulTotal);

    const ctx = document.getElementById('echeancierChart').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Cumul intérêts remboursés (€)',
                    data: labels.map((mois, i) => ({ x: mois, y: interetsCumul[i] })),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Coût total (€)',
                    data: labels.map((mois, i) => ({ x: mois, y: cumulTotal[i] })),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Capital restant dû (€)',
                    data: labels.map((mois, i) => ({ x: mois, y: capitalRestant[i] })),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        title: ctx => `Mois ${ctx[0].parsed.x} (Année ${Math.floor((ctx[0].parsed.x - 1) / 12) + 1})`,
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 1,
                    max: labels.length,
                    ticks: {
                        stepSize: 12,
                        callback: val => `A${Math.floor((val - 1) / 12) + 1}`
                    },
                    grid: {
                        drawOnChartArea: true,
                        color: (ctx) => ctx.tick.value % 12 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent'
                    },
                    title: {
                        display: true,
                        text: 'Durée (en mois / années)',
                        font: { weight: 'bold' }
                    }
                },
                y: {
                    ticks: {
                        callback: val => val.toLocaleString('fr-FR') + ' €'
                    },
                    title: {
                        display: true,
                        text: 'Montants (€)',
                        font: { weight: 'bold' }
                    }
                }
            }
        }
    });
}

// --- Télécharger l'échéancier en CSV ---
function telechargerCSV() {
    if (!window.dernierEcheancier || !Array.isArray(window.dernierEcheancier)) return;

    const enTete = [
        'Mois',
        'Mensualité (€)',
        'Capital (€)',
        'Intérêts (€)',
        'Cumul intérêts (€)',
        'Coût total (€)',
        'Restant dû (€)'
    ];

    const lignes = window.dernierEcheancier.map(ligne => [
        ligne.mois,
        ligne.mensualite.toFixed(2).replace('.', ','),
        ligne.principal.toFixed(2).replace('.', ','),
        ligne.interet.toFixed(2).replace('.', ','),
        ligne.cumulInteret.toFixed(2).replace('.', ','),
        ligne.cumulTotal.toFixed(2).replace('.', ','),
        ligne.capitalRestant.toFixed(2).replace('.', ',')
    ]);

    const contenuCSV = [enTete, ...lignes]
        .map(ligne => ligne.join(';'))
        .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + contenuCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'echeancier.csv';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
}

// --- Soumission du formulaire ---
function handleSubmit(event) {
    event.preventDefault();

    const montant = parseFloat(document.getElementById('montant').value);
    const taux = parseFloat(document.getElementById('taux').value);
    const duree = parseInt(document.getElementById('duree').value);

    if (montant <= 0 || taux < 0 || duree <= 0) {
        alert('Veuillez entrer des valeurs valides.');
        return;
    }

    handleCalculation(montant, taux, duree);
}
