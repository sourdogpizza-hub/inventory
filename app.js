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
            tg.showAlert("Server Error: " + data.error);
        } else {
            nomenclature = data;
            showScreen('menu-screen');
        }
    } catch (error) {
        tg.showAlert("Connection error. Please check your internet.");
    }
}

async function sendDataToGAS(action, dataObj) {
    if (GAS_URL.includes("macros/s/AKfycbyc")) {
        tg.showAlert("Data not sent: GAS URL not configured.");
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
            tg.showAlert("Error: " + result.error);
            return false;
        }
    } catch (error) {
        btn.disabled = false;
        btn.textContent = originalText;
        tg.showAlert("Failed to send data.");
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

            input.oninput = updateSubmitButtonState;
            
            // Сохраняем метаданные в элементе
            input.dataset.category = categoryName;
            input.dataset.name = prod.name;
            input.dataset.unit = prod.unit;

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
}

async function submitInventory() {
    const inputs = document.querySelectorAll('#inventory-container .amount-input-simple');
    const itemsToSave = [];

    inputs.forEach(input => {
        const amount = parseFloat(input.value);
        if (amount > 0) {
            itemsToSave.push({
                category: input.dataset.category,
                name: input.dataset.name,
                unit: input.dataset.unit,
                amount: amount
            });
        }
    });

    if (itemsToSave.length === 0) return;

    const action = subMode === 'inventory' ? 'save_inventory' : 'save_writeoff';
    const success = await sendDataToGAS(action, itemsToSave);
    if (success) {
        const msg = subMode === 'inventory' ? "✅ Inventory saved successfully!" : "✅ Write-off saved successfully!";
        tg.showAlert(msg, () => {
            tg.close();
        });
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
        tg.showAlert("Incorrect PIN");
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
        tg.showAlert("✅ Database updated successfully!", () => {
            exitEditMode(); 
        });
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
