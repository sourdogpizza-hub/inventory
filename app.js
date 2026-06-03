const tg = window.Telegram.WebApp;

// ==========================================
// ⚠️ ВАЖНО: Вставьте сюда свой GAS URL ⚠️
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbwPystejCsPwi0FnK3_rZUomTPqnwLW7zDMIViyUHuCGMjGqIOKZ2hxkTuETfbVYGx2/exec";

let nomenclature = [];
let currentMode = 'inventory'; // 'inventory' или 'edit'
let subMode = 'inventory'; // 'inventory' или 'writeoff'

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
            showScreen('menu-screen');
         }, 500);
         return;
    }

    try {
        const userId = tg.initDataUnsafe?.user?.id || "";
        const response = await fetch(`${GAS_URL}?userId=${userId}`);
        const data = await response.json();
        
        if (data.error === "access_denied") {
            document.getElementById('blocked-message').textContent = data.message || "To use this bot, you must be a member of the SOURDOG Telegram group.";
            showScreen('blocked-screen');
        } else if (data.error) {
            showAlert("Server Error: " + data.error);
        } else {
            nomenclature = data;
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
                userId: tg.initDataUnsafe?.user?.id || "",
                user: tg.initDataUnsafe?.user?.first_name || "Unknown"
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
        // Сбрасываем значения всех инпутов
        inputs.forEach(input => input.value = '');
        
        // Удаляем все добавленные строки
        document.querySelectorAll('#inventory-container .sub-inputs-container').forEach(container => {
            container.innerHTML = '';
        });
        
        updateSubmitButtonState();

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
    
    renderInventory();
    showScreen('inventory-screen');
}

function goToMainMenu() {
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
    tg.showConfirm("Delete category and all its products?", (confirmed) => {
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

function handleAddLine(button) {
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
            <div class="product-controls-simple">
                <input type="text" class="amount-input-simple" value="" placeholder="${placeholder}" inputmode="decimal">
            </div>
            <button class="btn-dots" onclick="showDotsMenu(this, event)"><i class="fas fa-ellipsis-v"></i></button>
        </div>
    `;
    
    const newInput = subItem.querySelector('.amount-input-simple');
    newInput.oninput = (e) => {
        sanitizeDecimalInput(e.target);
        updateSubmitButtonState();
    };
    newInput.dataset.category = category;
    newInput.dataset.name = name;
    newInput.dataset.unit = unit;
    
    subContainer.appendChild(subItem);
    
    // Auto-focus the new input
    setTimeout(() => newInput.focus(), 50);
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

// Автоматический пересчет и отображение граммов/миллилитров для весовых/жидких категорий
function updateAllUnitHelpers() {
    const groups = document.querySelectorAll('#inventory-container .product-group');
    groups.forEach(group => {
        const mainItem = group.querySelector('.product-item');
        if (!mainItem) return;
        const unitLabel = mainItem.querySelector('.product-unit');
        if (!unitLabel) return;
        
        const inputs = group.querySelectorAll('.amount-input-simple');
        let sum = 0;
        let hasAnyValue = false;
        let baseUnit = "";
        
        inputs.forEach(input => {
            const val = parseFloat(input.value);
            if (!isNaN(val) && val > 0) {
                sum += val;
                hasAnyValue = true;
            }
            if (!baseUnit && input.dataset.unit) {
                baseUnit = input.dataset.unit;
            }
        });
        
        if (!baseUnit) return;
        
        if (!hasAnyValue) {
            unitLabel.textContent = baseUnit;
            return;
        }
        
        const unitLower = baseUnit.toLowerCase();
        if (unitLower === 'kg' || unitLower === 'кг') {
            const grams = Math.round(sum * 1000);
            unitLabel.textContent = `${baseUnit} (${grams} g)`;
        } else if (unitLower === 'l' || unitLower === 'л') {
            const ml = Math.round(sum * 1000);
            unitLabel.textContent = `${baseUnit} (${ml} ml)`;
        } else {
            unitLabel.textContent = baseUnit;
        }
    });
}
