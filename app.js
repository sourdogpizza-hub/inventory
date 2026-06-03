const tg = window.Telegram.WebApp;

window.onerror = function(message, source, lineno, colno, error) {
    alert("Error: " + message + " at line " + lineno);
};

// ==========================================
// ⚠️ ВАЖНО: Вставьте сюда свой GAS URL ⚠️
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbwPystejCsPwi0FnK3_rZUomTPqnwLW7zDMIViyUHuCGMjGqIOKZ2hxkTuETfbVYGx2/exec";

let nomenclature = [];
let currentMode = 'inventory'; // 'inventory' или 'edit'
let subMode = 'inventory'; // 'inventory' или 'writeoff'
let activeDraftId = null;

// ==========================================
// ЧЕРНОВИКИ (DRAFTS - IN PROCESS)
// ==========================================

function getFormattedDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return {
        date: `${day}/${month}/${year}`,
        time: `${hours}:${minutes}`
    };
}

function showConfirm(message, callback) {
    if (tg && typeof tg.showPopup === 'function') {
        tg.showPopup({
            title: 'Confirm Deletion',
            message: message,
            buttons: [
                { id: "yes", type: "destructive", text: "Delete" },
                { id: "no", type: "cancel", text: "Cancel" }
            ]
        }, function(buttonId) {
            if (typeof callback === 'function') {
                callback(buttonId === "yes");
            }
        });
    } else {
        const confirmed = confirm(message);
        if (typeof callback === 'function') {
            callback(confirmed);
        }
    }
}

function updateDraftsButton() {
    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    const btn = document.getElementById('btn-in-process');
    const desc = document.getElementById('drafts-count-desc');
    
    if (drafts.length > 0) {
        btn.style.display = 'flex';
        if (desc) {
            desc.textContent = `Continue unfinished sessions (${drafts.length})`;
        }
    } else {
        btn.style.display = 'none';
    }
}

function saveActiveDraft() {
    if (!activeDraftId || currentMode !== 'inventory') return;

    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    let draft = drafts.find(d => d.id === activeDraftId);
    
    if (!draft) {
        const dateTime = getFormattedDateTime();
        draft = {
            id: activeDraftId,
            type: subMode,
            date: dateTime.date,
            time: dateTime.time,
            startedBy: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) ? tg.initDataUnsafe.user.first_name : "Unknown",
            items: []
        };
        drafts.push(draft);
    }

    const items = [];
    document.querySelectorAll('#inventory-container .product-group').forEach(group => {
        const mainInput = group.querySelector('.product-item:not(.sub-item) .amount-input-simple');
        if (!mainInput) return;
        const category = mainInput.dataset.category;
        const name = mainInput.dataset.name;
        const unit = mainInput.dataset.unit;
        
        const inputs = group.querySelectorAll('.amount-input-simple');
        const values = Array.from(inputs).map(inp => inp.value.trim());
        
        const hasValue = values.some(val => val !== "");
        const hasMultiple = values.length > 1;
        
        if (hasValue || hasMultiple) {
            items.push({
                category: category,
                name: name,
                unit: unit,
                values: values
            });
        }
    });

    draft.items = items;
    localStorage.setItem('sourdog_drafts', JSON.stringify(drafts));
    updateDraftsButton();
}

function showDraftsScreen() {
    renderDrafts();
    showScreen('drafts-screen');
}

function renderDrafts() {
    const container = document.getElementById('drafts-container');
    container.innerHTML = '';
    
    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    
    if (drafts.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--tg-theme-hint-color); padding: 40px 20px;">No active drafts found.</div>';
        return;
    }
    
    const sortedDrafts = [...drafts].reverse();
    
    sortedDrafts.forEach(draft => {
        const card = document.createElement('div');
        card.className = 'draft-card';
        card.onclick = () => resumeDraft(draft.id);
        
        const info = document.createElement('div');
        info.className = 'draft-info';
        
        const header = document.createElement('div');
        header.className = 'draft-header';
        
        const badge = document.createElement('span');
        const isInv = draft.type === 'inventory';
        badge.className = `draft-badge ${isInv ? 'inventory' : 'writeoff'}`;
        badge.textContent = isInv ? 'Inventory' : 'Write-off';
        header.appendChild(badge);
        
        info.appendChild(header);
        
        const meta = document.createElement('div');
        meta.className = 'draft-meta';
        
        const dateSpan = document.createElement('span');
        dateSpan.innerHTML = `<i class="far fa-calendar-alt"></i> ${draft.date} ${draft.time}`;
        meta.appendChild(dateSpan);
        
        const userSpan = document.createElement('span');
        userSpan.innerHTML = `<i class="far fa-user"></i> ${draft.startedBy || "Unknown"}`;
        meta.appendChild(userSpan);
        
        info.appendChild(meta);
        card.appendChild(info);
        
        const dotsBtn = document.createElement('button');
        dotsBtn.className = 'btn-dots';
        dotsBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        dotsBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            showDraftDotsMenu(dotsBtn, draft.id, e);
        };
        card.appendChild(dotsBtn);
        
        container.appendChild(card);
    });
}

let activeDraftDotsMenu = null;

function showDraftDotsMenu(button, draftId, event) {
    event.stopPropagation();
    event.preventDefault();
    
    if (activeDraftDotsMenu) {
        activeDraftDotsMenu.remove();
        activeDraftDotsMenu = null;
    }
    
    const menu = document.createElement('div');
    menu.className = 'dots-menu';
    
    const delBtn = document.createElement('div');
    delBtn.className = 'dots-menu-item text-danger';
    delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    delBtn.onclick = () => {
        menu.remove();
        activeDraftDotsMenu = null;
        showConfirm("Are you sure you want to delete this draft?", (confirmed) => {
            if (confirmed) {
                deleteDraft(draftId);
            }
        });
    };
    menu.appendChild(delBtn);
    
    document.body.appendChild(menu);
    activeDraftDotsMenu = menu;
    
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;
    
    const closeMenu = (e) => {
        if (activeDraftDotsMenu && !activeDraftDotsMenu.contains(e.target) && e.target !== button) {
            activeDraftDotsMenu.remove();
            activeDraftDotsMenu = null;
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

function deleteDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    const filtered = drafts.filter(d => d.id !== draftId);
    localStorage.setItem('sourdog_drafts', JSON.stringify(filtered));
    
    if (activeDraftId === draftId) {
        activeDraftId = null;
    }
    
    renderDrafts();
    updateDraftsButton();
}

function resumeDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    
    activeDraftId = draft.id;
    subMode = draft.type;
    
    document.getElementById('screen-title').textContent = subMode === 'inventory' ? 'Inventory' : 'Write-offs';
    const btn = document.getElementById('btn-submit-inventory');
    btn.textContent = subMode === 'inventory' ? 'Submit Inventory' : 'Submit Write-off';
    
    renderInventory();
    
    draft.items.forEach(item => {
        const mainInput = Array.from(document.querySelectorAll('#inventory-container .amount-input-simple')).find(inp => 
            inp.dataset.category === item.category && inp.dataset.name === item.name && !inp.closest('.sub-item')
        );
        
        if (mainInput) {
            const productGroup = mainInput.closest('.product-group');
            const dotsBtn = productGroup.querySelector('.btn-dots');
            
            for (let i = 1; i < item.values.length; i++) {
                handleAddLine(dotsBtn, false);
            }
            
            const allInputs = productGroup.querySelectorAll('.amount-input-simple');
            item.values.forEach((val, idx) => {
                if (allInputs[idx]) {
                    allInputs[idx].value = val;
                }
            });
        }
    });
    
    updateSubmitButtonState();
    showScreen('inventory-screen');
}

// Инициализация
tg.expand();
tg.ready();

document.addEventListener('DOMContentLoaded', () => {
    fetchNomenclature();
});

// ==========================================
// СЕТЕВОЕ ВЗАИМОДЕЙСТВИЕ
// ==========================================

async function fetchNomenclature() {
    showScreen('loader');
    
    if (GAS_URL.includes("macros/s/AKfycbyc")) {
         // Fallback test data
         console.warn("GAS URL not set. Using test data.");
         nomenclature = [
             {category: "Cheeses", name: "Mozzarella", unit: "kg"},
             {category: "Meats", name: "Pepperoni", unit: "kg"},
             {category: "Dough", name: "Flour 00", unit: "kg"}
         ];
         setTimeout(() => {
            updateDraftsButton();
            showScreen('menu-screen');
         }, 500);
         return;
    }

    try {
        const userId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? tg.initDataUnsafe.user.id : "";
        const response = await fetch(`${GAS_URL}?userId=${userId}`);
        const data = await response.json();
        
        if (data.error === "access_denied") {
            document.getElementById('blocked-message').textContent = data.message || "To use this bot, you must be a member of the SOURDOG Telegram group.";
            showScreen('blocked-screen');
        } else if (data.error) {
            showAlert("Server Error: " + data.error);
        } else {
            nomenclature = data;
            updateDraftsButton();
            showScreen('menu-screen');
        }
    } catch (error) {
        showAlert("Connection error. Please check your internet.");
    }
}

async function sendDataToGAS(action, dataObj) {
    if (GAS_URL.includes("macros/s/AKfycbyc")) {
        showAlert("Data not sent: GAS URL not configured.");
        return true; 
    }

    const btnId = (action === 'save_inventory' || action === 'save_writeoff') ? 'btn-submit-inventory' : 'btn-submit-nomenclature';
    const btn = document.getElementById(btnId);
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = "Saving...";
    
    try {
        const response = await fetch(GAS_URL, {
            method: "POST",
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
                action: action,
                data: dataObj,
                userId: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? tg.initDataUnsafe.user.id : "",
                user: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) ? tg.initDataUnsafe.user.first_name : "Unknown"
            })
        });

        const result = await response.json();
        btn.disabled = false;
        btn.textContent = originalText;

        if (result.status === "success") {
            return true;
        } else {
            showAlert("Error: " + result.error);
            return false;
        }
    } catch (error) {
        btn.disabled = false;
        btn.textContent = originalText;
        showAlert("Failed to send data.");
        return false;
    }
}

// ==========================================
// РЕНДЕРИНГ: ИНВЕНТАРИЗАЦИЯ
// ==========================================

function renderInventory() {
    const container = document.getElementById('inventory-container');
    container.innerHTML = '';

    const categories = groupByCategory(nomenclature);

    for (const [categoryName, products] of Object.entries(categories)) {
        const catTpl = document.getElementById('tpl-inventory-category').content.cloneNode(true);
        catTpl.querySelector('.category-title').textContent = categoryName;
        
        const productsList = catTpl.querySelector('.products-list');

        products.forEach(prod => {
            const prodTpl = document.getElementById('tpl-inventory-product').content.cloneNode(true);
            prodTpl.querySelector('.product-name').textContent = prod.name;
            prodTpl.querySelector('.product-unit').textContent = prod.unit;
            
            const input = prodTpl.querySelector('.amount-input-simple');

            input.oninput = (e) => {
                sanitizeDecimalInput(e.target);
                updateSubmitButtonState();
                saveActiveDraft();
            };
            
            // Сохраняем метаданные в элементе
            input.dataset.category = categoryName;
            input.dataset.name = prod.name;
            input.dataset.unit = prod.unit;

            // Задаем хинт 0.000 для весовых/жидких продуктов
            const isWeightOrLiquid = (prod.unit && (prod.unit.toLowerCase() === 'kg' || prod.unit.toLowerCase() === 'кг' || prod.unit.toLowerCase() === 'l' || prod.unit.toLowerCase() === 'л'));
            input.placeholder = isWeightOrLiquid ? "0.000" : "0";

            productsList.appendChild(prodTpl);
        });

        container.appendChild(catTpl);
    }

    updateSubmitButtonState(); // Скрыть если пусто
}

function updateSubmitButtonState() {
    if (currentMode !== 'inventory') return;

    const inputs = document.querySelectorAll('#inventory-container .amount-input-simple');
    let hasData = false;
    inputs.forEach(input => {
        if (input.value && parseFloat(input.value) > 0) hasData = true;
    });

    const btnContainer = document.querySelector('#inventory-screen .submit-btn-container');
    if (hasData) {
        btnContainer.style.display = 'block';
    } else {
        btnContainer.style.display = 'none';
    }

    // Обновляем подсказки перевода в граммы / мл
    updateAllUnitHelpers();
}

async function submitInventory() {
    const inputs = document.querySelectorAll('#inventory-container .amount-input-simple');
    
    // Группируем количества в виде строк для сохранения точности (дробная часть)
    const groups = {};
    inputs.forEach(input => {
        const valStr = input.value.trim();
        const amount = parseFloat(valStr);
        if (amount > 0) {
            const key = `${input.dataset.category}:::${input.dataset.name}:::${input.dataset.unit}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(valStr);
        }
    });

    const itemsToSave = [];
    for (const [key, valStrings] of Object.entries(groups)) {
        const [category, name, unit] = key.split(':::');
        
        let sum = 0;
        let maxDecimals = 0;
        valStrings.forEach(valStr => {
            sum += parseFloat(valStr);
            const parts = valStr.split('.');
            const decimals = parts.length > 1 ? parts[1].length : 0;
            if (decimals > maxDecimals) {
                maxDecimals = decimals;
            }
        });
        
        // Форматируем сумму с максимальной точностью из введенных полей
        const formattedAmount = sum.toFixed(maxDecimals);
        
        itemsToSave.push({
            category: category,
            name: name,
            unit: unit,
            amount: formattedAmount // отправляем как строку (например, "0.180")
        });
    }

    if (itemsToSave.length === 0) return;

    const action = subMode === 'inventory' ? 'save_inventory' : 'save_writeoff';
    const success = await sendDataToGAS(action, itemsToSave);
    if (success) {
        // Удаляем этот черновик из localStorage
        if (activeDraftId) {
            const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
            const filtered = drafts.filter(d => d.id !== activeDraftId);
            localStorage.setItem('sourdog_drafts', JSON.stringify(filtered));
            activeDraftId = null;
        }

        // Сбрасываем значения всех инпутов
        inputs.forEach(input => input.value = '');
        
        // Удаляем все добавленные строки
        document.querySelectorAll('#inventory-container .sub-inputs-container').forEach(container => {
            container.innerHTML = '';
        });
        
        updateSubmitButtonState();
        updateDraftsButton();

        const title = subMode === 'inventory' ? "Inventory Saved" : "Write-off Saved";
        const msg = subMode === 'inventory' 
            ? "Your inventory report has been successfully uploaded to Google Sheets." 
            : "Your write-off report has been successfully logged.";

        showSuccessModal(title, msg);
    }
}

// Запуск определенного режима из меню
function startAppMode(mode) {
    subMode = mode;
    
    // Меняем заголовок экрана
    document.getElementById('screen-title').textContent = mode === 'inventory' ? 'Inventory' : 'Write-offs';
    
    // Меняем текст кнопки отправки
    const btn = document.getElementById('btn-submit-inventory');
    btn.textContent = mode === 'inventory' ? 'Submit Inventory' : 'Submit Write-off';
    
    // Генерируем новый ID черновика
    activeDraftId = "draft_" + Date.now();
    
    const dateTime = getFormattedDateTime();
    const newDraft = {
        id: activeDraftId,
        type: subMode,
        date: dateTime.date,
        time: dateTime.time,
        startedBy: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) ? tg.initDataUnsafe.user.first_name : "Unknown",
        items: []
    };
    const drafts = JSON.parse(localStorage.getItem('sourdog_drafts') || '[]');
    drafts.push(newDraft);
    localStorage.setItem('sourdog_drafts', JSON.stringify(drafts));
    
    renderInventory();
    showScreen('inventory-screen');
}

function goToMainMenu() {
    activeDraftId = null; // Очищаем активный черновик при возврате на главный экран
    updateDraftsButton();
    showScreen('menu-screen');
}

// ==========================================
// ПАРОЛЬ И РЕЖИМЫ
// ==========================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function openPasswordModal() {
    document.getElementById('pin-input').value = '';
    document.getElementById('password-modal').classList.add('active');
}

function closePasswordModal() {
    document.getElementById('password-modal').classList.remove('active');
}

function checkPassword() {
    const pin = document.getElementById('pin-input').value;
    if (pin === "1111") {
        closePasswordModal();
        enterEditMode();
    } else {
        showAlert("Incorrect PIN");
    }
}

let successModalCallback = null;

function showSuccessModal(title, message, callback = null) {
    document.getElementById('success-modal-title').textContent = title;
    document.getElementById('success-modal-message').textContent = message;
    successModalCallback = callback;
    document.getElementById('success-modal').classList.add('active');
}

function closeSuccessModal() {
    document.getElementById('success-modal').classList.remove('active');
    if (successModalCallback) {
        successModalCallback();
    } else {
        goToMainMenu();
    }
}

function showAlert(message, callback) {
    if (tg && typeof tg.showAlert === 'function') {
        tg.showAlert(message, callback);
    } else {
        alert(message);
        if (typeof callback === 'function') {
            callback();
        }
    }
}

function enterEditMode() {
    currentMode = 'edit';
    renderEditMode();
    showScreen('edit-screen');
}

function exitEditMode() {
    currentMode = 'inventory';
    showScreen('menu-screen');
}

// ==========================================
// РЕНДЕРИНГ И ЛОГИКА: РЕДАКТИРОВАНИЕ
// ==========================================

function renderEditMode() {
    const container = document.getElementById('edit-container');
    container.innerHTML = '';

    const categories = groupByCategory(nomenclature);

    for (const [categoryName, products] of Object.entries(categories)) {
        appendCategoryEditBlock(container, categoryName, products);
    }
}

function appendCategoryEditBlock(container, categoryName = "", products = []) {
    const catTpl = document.getElementById('tpl-edit-category').content.cloneNode(true);
    const catBlock = catTpl.querySelector('.category-block');
    const inputName = catTpl.querySelector('.category-name-input');
    const productsList = catTpl.querySelector('.products-list');
    
    inputName.value = categoryName;

    products.forEach(prod => {
        appendProductEditBlock(productsList, prod.name, prod.unit);
    });

    container.appendChild(catTpl);
}

function appendProductEditBlock(container, name = "", unit = "") {
    const prodTpl = document.getElementById('tpl-edit-product').content.cloneNode(true);
    prodTpl.querySelector('.product-name-input').value = name;
    prodTpl.querySelector('.product-unit-input').value = unit;
    container.appendChild(prodTpl);
}

// Функции для кнопок в режиме редактирования (вызываются из HTML)
function addCategory() {
    const container = document.getElementById('edit-container');
    appendCategoryEditBlock(container, "", []);
}

function deleteCategory(btn) {
    const block = btn.closest('.category-block');
    showConfirm("Delete category and all its products?", (confirmed) => {
        if (confirmed) block.remove();
    });
}

function addProductToCategory(btn) {
    const productsList = btn.closest('.category-block').querySelector('.products-list');
    appendProductEditBlock(productsList, "", "");
}

function deleteProduct(btn) {
    btn.closest('.product-item').remove();
}

async function submitNomenclature() {
    // Собираем данные из DOM
    const newNomenclature = [];
    const catBlocks = document.querySelectorAll('#edit-container .category-block');

    catBlocks.forEach(catBlock => {
        const catName = catBlock.querySelector('.category-name-input').value.trim();
        if (!catName) return; // Игнорируем пустые категории

        const prodItems = catBlock.querySelectorAll('.product-item');
        prodItems.forEach(prodItem => {
            const prodName = prodItem.querySelector('.product-name-input').value.trim();
            const prodUnit = prodItem.querySelector('.product-unit-input').value.trim();
            
            if (prodName) {
                newNomenclature.push({
                    category: catName,
                    name: prodName,
                    unit: prodUnit
                });
            }
        });
    });

    const success = await sendDataToGAS('update_nomenclature', newNomenclature);
    if (success) {
        nomenclature = newNomenclature; // Обновляем локально
        showSuccessModal(
            "Database Saved", 
            "The product nomenclature database has been successfully updated in Google Sheets.", 
            () => {
                exitEditMode(); 
            }
        );
    }
}

// ==========================================
// УТИЛИТЫ
// ==========================================
function groupByCategory(items) {
    return items.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {});
}

// ==========================================
// ЛОГИКА ДОБАВЛЕНИЯ/УДАЛЕНИЯ ПОЛЕЙ ВВОДА (3 ТОЧКИ)
// ==========================================
let activeDotsMenu = null;

function showDotsMenu(button, event) {
    event.stopPropagation();
    event.preventDefault();
    
    // Закрываем предыдущее меню, если оно открыто
    if (activeDotsMenu) {
        activeDotsMenu.remove();
        activeDotsMenu = null;
    }
    
    const productGroup = button.closest('.product-group');
    const inputsCount = productGroup.querySelectorAll('.amount-input-simple').length;
    
    // Создаем элемент меню
    const menu = document.createElement('div');
    menu.className = 'dots-menu';
    
    // Пункт "Добавить строку"
    const addBtn = document.createElement('div');
    addBtn.className = 'dots-menu-item';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
    addBtn.onclick = () => {
        handleAddLine(button);
        menu.remove();
        activeDotsMenu = null;
    };
    menu.appendChild(addBtn);
    
    // Пункт "Удалить строку"
    const delBtn = document.createElement('div');
    delBtn.className = 'dots-menu-item text-danger';
    if (inputsCount <= 1) {
        delBtn.className += ' disabled';
    }
    delBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    delBtn.onclick = () => {
        if (inputsCount > 1) {
            handleDeleteLine(button);
        }
        menu.remove();
        activeDotsMenu = null;
    };
    menu.appendChild(delBtn);
    
    // Добавляем меню в body, чтобы избежать проблем с overflow hidden
    document.body.appendChild(menu);
    activeDotsMenu = menu;
    
    // Позиционируем меню рядом с кнопкой
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;
    
    // Закрытие меню при клике в любое другое место
    const closeMenu = (e) => {
        if (activeDotsMenu && !activeDotsMenu.contains(e.target) && e.target !== button) {
            activeDotsMenu.remove();
            activeDotsMenu = null;
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

function handleAddLine(button, shouldFocus = true) {
    const productGroup = button.closest('.product-group');
    const subContainer = productGroup.querySelector('.sub-inputs-container');
    const mainItem = productGroup.querySelector('.product-item');
    
    const mainInput = mainItem.querySelector('.amount-input-simple');
    const category = mainInput.dataset.category;
    const name = mainInput.dataset.name;
    const unit = mainInput.dataset.unit;
    
    const subItem = document.createElement('div');
    subItem.className = 'product-item sub-item';
    const isWeightOrLiquid = (unit && (unit.toLowerCase() === 'kg' || unit.toLowerCase() === 'кг' || unit.toLowerCase() === 'l' || unit.toLowerCase() === 'л'));
    const placeholder = isWeightOrLiquid ? "0.000" : "0";

    subItem.innerHTML = `
        <div class="product-info" style="visibility: hidden;">
            <span class="product-name">${name}</span>
            <span class="product-unit">${unit}</span>
        </div>
        <div class="product-actions">
            <div class="product-input-wrapper">
                <div class="product-controls-simple">
                    <input type="text" class="amount-input-simple" value="" placeholder="${placeholder}" inputmode="decimal">
                </div>
                <div class="input-helper-text"></div>
            </div>
            <button class="btn-dots" onclick="showDotsMenu(this, event)"><i class="fas fa-ellipsis-v"></i></button>
        </div>
    `;
    
    const newInput = subItem.querySelector('.amount-input-simple');
    newInput.oninput = (e) => {
        sanitizeDecimalInput(e.target);
        updateSubmitButtonState();
        saveActiveDraft();
    };
    newInput.dataset.category = category;
    newInput.dataset.name = name;
    newInput.dataset.unit = unit;
    
    subContainer.appendChild(subItem);
    saveActiveDraft();
    
    // Auto-focus the new input
    if (shouldFocus) {
        setTimeout(() => newInput.focus(), 50);
    }
}

function handleDeleteLine(button) {
    const productItem = button.closest('.product-item');
    const productGroup = button.closest('.product-group');
    
    const inputs = productGroup.querySelectorAll('.amount-input-simple');
    if (inputs.length <= 1) return;
    
    if (productItem.classList.contains('sub-item')) {
        productItem.remove();
    } else {
        const subItems = productGroup.querySelectorAll('.sub-item');
        if (subItems.length > 0) {
            const firstSub = subItems[0];
            const firstSubInput = firstSub.querySelector('.amount-input-simple');
            const mainInput = productItem.querySelector('.amount-input-simple');
            
            mainInput.value = firstSubInput.value;
            firstSub.remove();
        }
    }
    updateSubmitButtonState();
    saveActiveDraft();
}

function sanitizeDecimalInput(input) {
    // Заменяем все запятые на точки
    let val = input.value.replace(/,/g, '.');
    // Удаляем все символы кроме цифр и одной точки
    val = val.replace(/[^0-9.]/g, '');
    
    const parts = val.split('.');
    if (parts.length > 2) {
        // Если точек несколько, оставляем только первую
        val = parts[0] + '.' + parts.slice(1).join('');
    }
    input.value = val;
}

// Автоматический пересчет и отображение граммов/миллилитров для каждого отдельного поля ввода
function updateAllUnitHelpers() {
    const inputs = document.querySelectorAll('#inventory-container .amount-input-simple');
    inputs.forEach(input => {
        const wrapper = input.closest('.product-input-wrapper');
        if (!wrapper) return;
        const helper = wrapper.querySelector('.input-helper-text');
        if (!helper) return;
        
        const val = parseFloat(input.value);
        const baseUnit = input.dataset.unit || "";
        
        if (isNaN(val) || val <= 0 || !baseUnit) {
            helper.textContent = ""; // очищаем если поле пустое
            return;
        }
        
        const unitLower = baseUnit.toLowerCase();
        if (unitLower === 'kg' || unitLower === 'кг') {
            if (val < 1) {
                const grams = Math.round(val * 1000);
                helper.textContent = `${grams} g`;
            } else {
                const kg = Math.floor(val);
                const grams = Math.round((val - kg) * 1000);
                if (grams === 0) {
                    helper.textContent = `${kg} kg`;
                } else {
                    helper.textContent = `${kg} kg ${grams} g`;
                }
            }
        } else if (unitLower === 'l' || unitLower === 'л') {
            if (val < 1) {
                const ml = Math.round(val * 1000);
                helper.textContent = `${ml} ml`;
            } else {
                const liters = Math.floor(val);
                const ml = Math.round((val - liters) * 1000);
                if (ml === 0) {
                    helper.textContent = `${liters} l`;
                } else {
                    helper.textContent = `${liters} l ${ml} ml`;
                }
            }
        } else {
            helper.textContent = "";
        }
    });

    // Возвращаем подписи в product-unit в исходное состояние (кг/л/шт)
    const mainUnits = document.querySelectorAll('#inventory-container .product-unit');
    mainUnits.forEach(label => {
        const productGroup = label.closest('.product-group');
        const input = productGroup ? productGroup.querySelector('.amount-input-simple') : null;
        if (input && input.dataset.unit) {
            label.textContent = input.dataset.unit;
        }
    });
}
