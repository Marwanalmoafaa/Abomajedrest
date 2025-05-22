let currentView = 'dailyEntryView';
// تعديل هيكل تخزين الرواتب
let database = JSON.parse(localStorage.getItem('abuMajedRestaurantData')) || { dailyEntries: {}, monthlyExpenses: {} };

// --- بداية: متغيرات وإعدادات لمفهوم المزامنة السحابية ---
const API_ENDPOINT = 'YOUR_CLOUDFUNCTION_OR_SERVER_ENDPOINT'; //  <-- !! استبدل هذا برابط الخادم الفعلي
let isOnline = navigator.onLine;
let syncQueue = JSON.parse(localStorage.getItem('abuMajedSyncQueue')) || [];

window.addEventListener('online', () => { isOnline = true; processSyncQueue(); });
window.addEventListener('offline', () => { isOnline = false; });
// --- نهاية: متغيرات وإعدادات لمفهوم المزامنة السحابية ---


document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    const entryDateInput = document.getElementById('entryDate');
    if (entryDateInput) entryDateInput.value = today;

    const reportDateInput = document.getElementById('reportDate');
    if (reportDateInput) {
        reportDateInput.value = today;
        reportDateInput.addEventListener('change', generateDailyReport);
    }

    const reportMonthInput = document.getElementById('reportMonth');
    if (reportMonthInput) {
        reportMonthInput.value = new Date().toISOString().slice(0, 7);
        reportMonthInput.addEventListener('change', generateMonthlyReport);
    }


    setupAutoSave();
    updateActiveNavButton();
    showView(currentView);
    if (currentView === 'dailyReportView') generateDailyReport();
    if (currentView === 'monthlyReportView') generateMonthlyReport();

    // --- بداية: محاولة جلب البيانات من السحابة عند التحميل الأولي ---
    // fetchDataFromCloud(); // يمكنك تفعيل هذه إذا أردت محاولة جلب البيانات عند بدء التشغيل
    // --- نهاية: محاولة جلب البيانات من السحابة عند التحميل الأولي ---
    processSyncQueue(); // محاولة مزامنة أي بيانات عالقة عند بدء التشغيل إذا كان هناك اتصال
});

function updateActiveNavButton() {
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('active-nav-button');
        if (btn.getAttribute('onclick') === `showView('${currentView}')`) {
            btn.classList.add('active-nav-button');
        }
    });
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
    const activeViewElement = document.getElementById(viewId);
    if (activeViewElement) {
        activeViewElement.classList.add('active-view');
        currentView = viewId;
        updateActiveNavButton();
        if (viewId === 'dailyReportView') generateDailyReport();
        if (viewId === 'monthlyReportView') {
            loadMonthlyExpensesToForm(); // تحميل المصروفات الشهرية عند عرض الواجهة
            generateMonthlyReport();
        }
    }
}

function addEntryItem(category) {
    const container = document.getElementById(category + 'Container');
    if (!container) return;

    const newItemDiv = document.createElement('div');
    newItemDiv.classList.add('entry-item');
    const placeholderName = category === 'expenses' ? 'وصف المصروف' : 'اسم الصنف';
    newItemDiv.innerHTML = `
        <input type="text" class="itemName" placeholder="${placeholderName}">
        <input type="number" class="itemPrice" placeholder="السعر" step="0.01">
        <button type="button" class="remove-button" onclick="this.parentElement.remove(); autoSaveDailyEntry();">إزالة</button>
    `;
    container.appendChild(newItemDiv);
    newItemDiv.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', autoSaveDailyEntry);
    });
}

// --- بداية: تعديل وظائف الحفظ والمزامنة ---
async function saveData(dataToSync = null, actionType = 'update') {
    // 1. الحفظ المحلي دائمًا
    localStorage.setItem('abuMajedRestaurantData', JSON.stringify(database));
    console.log("Data saved locally:", database);

    // 2. محاولة المزامنة مع السحابة
    if (isOnline) {
        try {
            // إذا لم يتم تمرير بيانات محددة للمزامنة، افترض مزامنة قاعدة البيانات بأكملها
            // هذا تبسيط، في الواقع سترسل فقط التغييرات أو البيانات ذات الصلة
            const payload = dataToSync || { allData: database, deviceId: getDeviceId() }; // أضف معرفًا للجهاز إذا لزم الأمر

            // مثال على إرسال البيانات. يجب أن يكون لديك خادم يستقبل هذا الطلب.
            // const response = await fetch(`${API_ENDPOINT}/sync`, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' /* , 'Authorization': 'Bearer YOUR_TOKEN' */ },
            //     body: JSON.stringify({ action: actionType, payload: payload })
            // });
            // if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            // const result = await response.json();
            // console.log('Data synced with cloud:', result);
            // localStorage.removeItem('abuMajedSyncQueue'); // مسح قائمة الانتظار بعد نجاح المزامنة الكاملة
            // syncQueue = [];
            alert("تم الحفظ محلياً. (مفهوم المزامنة السحابية مُفعل نظرياً)");


        } catch (error) {
            console.error('Cloud sync failed, data saved locally. Will retry later.', error);
            // إذا فشلت المزامنة، أضف العملية إلى قائمة الانتظار (إذا لم تكن بيانات كاملة)
            if (dataToSync) { // فقط ضع العمليات المحددة في قائمة الانتظار
                addToSyncQueue({ type: actionType, payload: dataToSync, timestamp: Date.now()});
            }
            alert("فشل الاتصال بالخادم، تم الحفظ محلياً. ستتم محاولة المزامنة لاحقاً.");
        }
    } else {
        console.log('Offline, data saved locally. Will sync when online.');
        if (dataToSync) { // فقط ضع العمليات المحددة في قائمة الانتظار
             addToSyncQueue({ type: actionType, payload: dataToSync, timestamp: Date.now()});
        }
        alert("لا يوجد اتصال بالإنترنت، تم الحفظ محلياً. ستتم المزامنة عند عودة الاتصال.");
    }
}

function addToSyncQueue(operation) {
    syncQueue.push(operation);
    localStorage.setItem('abuMajedSyncQueue', JSON.stringify(syncQueue));
}

async function processSyncQueue() {
    if (!isOnline || syncQueue.length === 0) return;

    let failedOperations = [];
    // ملاحظة: هذا مثال مبسط جداً. المزامنة الحقيقية تتطلب معالجة تعارضات البيانات.
    // سترسل كل عملية في قائمة الانتظار بشكل فردي.
    // من الأفضل إرسالها دفعة واحدة أو تصميم API يستقبل مجموعة عمليات.

    // for (const operation of syncQueue) {
    //     try {
    //         const response = await fetch(`${API_ENDPOINT}/sync`, {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' /*, 'Authorization': 'Bearer YOUR_TOKEN' */ },
    //             body: JSON.stringify({ action: operation.type, payload: operation.payload, deviceId: getDeviceId() })
    //         });
    //         if (!response.ok) throw new Error(`Sync operation failed: ${operation.type}`);
    //         console.log('Queued operation synced:', operation);
    //     } catch (error) {
    //         console.error('Failed to sync queued operation:', error);
    //         failedOperations.push(operation); // أعد إضافته إذا فشل
    //     }
    // }
    // syncQueue = failedOperations; // احتفظ فقط بالعمليات الفاشلة
    // localStorage.setItem('abuMajedSyncQueue', JSON.stringify(syncQueue));

    // if (syncQueue.length === 0) {
    //     console.log("Sync queue processed successfully.");
    // } else {
    //     console.log("Some sync operations failed, will retry later.");
    // }
    console.log("مفهوم معالجة قائمة المزامنة: يوجد " + syncQueue.length + " عملية في الانتظار.");
    // في تطبيق حقيقي، ستقوم بإرسال هذه العمليات للخادم هنا.
}

function getDeviceId() { // دالة بسيطة لإنشاء/الحصول على معرف فريد للجهاز (للتتبع)
    let deviceId = localStorage.getItem('abuMajedDeviceId');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('abuMajedDeviceId', deviceId);
    }
    return deviceId;
}

// async function fetchDataFromCloud() {
//     if (!isOnline) {
//         console.log("Offline, cannot fetch data from cloud.");
//         return;
//     }
//     try {
//         const response = await fetch(`${API_ENDPOINT}/data?deviceId=${getDeviceId()}`); // استبدل بنقطة النهاية الصحيحة
//         if (!response.ok) throw new Error('Failed to fetch data');
//         const cloudData = await response.json();
//
//         // هذا مثال مبسط لدمج البيانات، قد تحتاج إلى منطق أكثر تعقيدًا
//         // لدمج البيانات أو معالجة التعارضات
//         if (cloudData && cloudData.dailyEntries) {
//             // مثال: دمج بسيط، بيانات السحابة هي المصدر الموثوق
//             // أو يمكن أن يكون لديك منطق للدمج بناءً على الطوابع الزمنية
//             database.dailyEntries = { ...database.dailyEntries, ...cloudData.dailyEntries };
//         }
//         if (cloudData && cloudData.monthlyExpenses) {
//             database.monthlyExpenses = { ...database.monthlyExpenses, ...cloudData.monthlyExpenses };
//         }
//         saveData(); // حفظ البيانات المدمجة محليًا (بدون إرسالها للسحابة مرة أخرى هنا)
//         console.log("Data fetched and merged from cloud.");
//         // تحديث الواجهة بعد جلب البيانات
//         if (currentView === 'dailyReportView') generateDailyReport();
//         if (currentView === 'monthlyReportView') { loadMonthlyExpensesToForm(); generateMonthlyReport(); }
//
//     } catch (error) {
//         console.error("Error fetching data from cloud:", error);
//     }
// }
// --- نهاية: تعديل وظائف الحفظ والمزامنة ---

function collectDailyData() {
    const date = document.getElementById('entryDate').value;
    const period = document.getElementById('entryPeriod').value;

    if (!date) return null;

    const entryData = {
        purchases: [], sales: [], expenses: [], totals: {}
    };

    ['purchases', 'sales', 'expenses'].forEach(category => { // تمت إزالة 'returns'
        const container = document.getElementById(category + 'Container');
        if (container) {
            const items = container.querySelectorAll('.entry-item');
            items.forEach(itemDiv => {
                const nameInput = itemDiv.querySelector('.itemName');
                const priceInput = itemDiv.querySelector('.itemPrice');
                if (nameInput && priceInput && nameInput.value && priceInput.value) {
                    entryData[category].push({
                        name: nameInput.value,
                        price: parseFloat(priceInput.value)
                    });
                }
            });
        }
    });
    return { date, period, data: entryData };
}


function autoSaveDailyEntry() {
    const collected = collectDailyData();
    if (!collected) return;

    const { date, period, data } = collected;

    if (!database.dailyEntries[date]) {
        database.dailyEntries[date] = { morning: {}, evening: {} };
    }
    database.dailyEntries[date][period] = data;
    calculateDailyTotals(date, period);
    // تعديل: تمرير البيانات التي تغيرت فقط للمزامنة (مثال)
    const dataToSync = { path: `dailyEntries.${date}.${period}`, value: data };
    saveData(dataToSync, 'update_daily');
}

function setupAutoSave() {
    const entryDateEl = document.getElementById('entryDate');
    if(entryDateEl) entryDateEl.addEventListener('change', autoSaveDailyEntry);

    const entryPeriodEl = document.getElementById('entryPeriod');
    if(entryPeriodEl) entryPeriodEl.addEventListener('change', autoSaveDailyEntry);

    ['purchasesContainer', 'salesContainer', 'expensesContainer'].forEach(containerId => { // تمت إزالة 'returnsContainer'
        const container = document.getElementById(containerId);
        if (container) {
            container.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', autoSaveDailyEntry);
            });
        }
    });
}

document.getElementById('dailyEntryForm').addEventListener('submit', function(event) {
    event.preventDefault();
    autoSaveDailyEntry();
    // alert('تم حفظ البيانات وتحديث الإجماليات!'); // تم نقله إلى دالة saveData
    // إعادة تعيين جزئية للحقول
    ['purchasesContainer', 'salesContainer', 'expensesContainer'].forEach(id => { // تمت إزالة 'returnsContainer'
        const container = document.getElementById(id);
        if (!container) return;
        const items = container.querySelectorAll('.entry-item');
        for (let i = items.length - 1; i > 0; i--) {
            const nameInput = items[i].querySelector('.itemName');
            const priceInput = items[i].querySelector('.itemPrice');
            if (nameInput && priceInput && !nameInput.value && !priceInput.value) {
                items[i].remove();
            }
        }
        const firstItemName = container.querySelector('.entry-item .itemName');
        const firstItemPrice = container.querySelector('.entry-item .itemPrice');
        if (firstItemName) firstItemName.value = '';
        if (firstItemPrice) firstItemPrice.value = '';
    });
    if (currentView === 'dailyReportView') generateDailyReport();
});

function calculateDailyTotals(date, period) {
    if (!database.dailyEntries[date] || !database.dailyEntries[date][period]) return;

    const data = database.dailyEntries[date][period];
    let totalPurchases = 0, totalSales = 0, totalExpenses = 0; // تمت إزالة totalReturns

    (data.purchases || []).forEach(item => totalPurchases += item.price);
    (data.sales || []).forEach(item => totalSales += item.price);
    (data.expenses || []).forEach(item => totalExpenses += item.price);
    // تم حذف حساب المرتجعات

    data.totals = {
        purchases: totalPurchases,
        sales: totalSales,
        expenses: totalExpenses,
        // returns: 0, // تمت إزالة المرتجعات
        net: totalSales - (totalPurchases + totalExpenses) // تعديل صافي الربح
    };
}

function generateDailyReport() {
    const reportDateInput = document.getElementById('reportDate');
    if (!reportDateInput) return;
    const reportDate = reportDateInput.value;
    const outputDiv = document.getElementById('dailyReportOutput');
    if (!outputDiv) return;
    outputDiv.innerHTML = '';

    if (!reportDate || !database.dailyEntries[reportDate]) {
        outputDiv.innerHTML = `<p>لا توجد بيانات لهذا اليوم (${reportDate}).</p>`;
        return;
    }

    let reportHTML = `<h3>تقرير يوم: ${reportDate}</h3>`;
    let overallDayTotal = { purchases: 0, sales: 0, expenses: 0, net: 0 }; // تمت إزالة returns

    ['morning', 'evening'].forEach(period => {
        if (database.dailyEntries[reportDate][period] && Object.keys(database.dailyEntries[reportDate][period]).length > 0 ) {
            const periodData = database.dailyEntries[reportDate][period];
            calculateDailyTotals(reportDate, period);

            if (periodData.totals && (periodData.totals.sales > 0 || periodData.totals.purchases > 0 || periodData.totals.expenses > 0)) {
                reportHTML += `<h4>فترة ${period === 'morning' ? 'الصباح' : 'المساء'}:</h4>`;
                reportHTML += '<ul>';
                if (periodData.totals.purchases > 0 || (periodData.purchases && periodData.purchases.length > 0)) {
                    reportHTML += `<li><strong>إجمالي المشتريات:</strong> ${periodData.totals.purchases.toFixed(2)} ريال</li>`;
                    (periodData.purchases || []).forEach(p => reportHTML += `<li class="item-detail"><em>- ${p.name}: ${p.price.toFixed(2)}</em></li>`);
                    overallDayTotal.purchases += periodData.totals.purchases;
                }
                if (periodData.totals.sales > 0 || (periodData.sales && periodData.sales.length > 0)) {
                    reportHTML += `<li><strong>إجمالي المبيعات:</strong> ${periodData.totals.sales.toFixed(2)} ريال</li>`;
                    (periodData.sales || []).forEach(s => reportHTML += `<li class="item-detail"><em>- ${s.name}: ${s.price.toFixed(2)}</em></li>`);
                    overallDayTotal.sales += periodData.totals.sales;
                }
                if (periodData.totals.expenses > 0 || (periodData.expenses && periodData.expenses.length > 0)) {
                    reportHTML += `<li><strong>إجمالي المصروفات:</strong> ${periodData.totals.expenses.toFixed(2)} ريال</li>`;
                    (periodData.expenses || []).forEach(e => reportHTML += `<li class="item-detail"><em>- ${e.name}: ${e.price.toFixed(2)}</em></li>`);
                    overallDayTotal.expenses += periodData.totals.expenses;
                }
                // تم حذف عرض المرتجعات
                reportHTML += `<li class="total-line"><strong>الصافي للفترة:</strong> ${periodData.totals.net.toFixed(2)} ريال</li>`;
                reportHTML += '</ul>';
                overallDayTotal.net += periodData.totals.net;
            }
        }
    });
    if (overallDayTotal.sales > 0 || overallDayTotal.purchases > 0 || overallDayTotal.expenses > 0) {
        reportHTML += `<h4>الإجمالي اليومي الكلي:</h4>`;
        reportHTML += '<ul>';
        reportHTML += `<li>إجمالي المشتريات اليومي: ${overallDayTotal.purchases.toFixed(2)} ريال</li>`;
        reportHTML += `<li>إجمالي المبيعات اليومي: ${overallDayTotal.sales.toFixed(2)} ريال</li>`;
        reportHTML += `<li>إجمالي المصروفات اليومي: ${overallDayTotal.expenses.toFixed(2)} ريال</li>`;
        // تم حذف عرض إجمالي المرتجعات
        reportHTML += `<li class="total-line"><strong>الصافي اليومي الكلي: ${overallDayTotal.net.toFixed(2)} ريال</strong></li>`;
        reportHTML += '</ul>';
    } else if (!reportHTML.includes("<h4>")) {
         outputDiv.innerHTML = `<p>لا توجد إجماليات مسجلة لهذا اليوم (${reportDate}).</p>`;
         return;
    }
    outputDiv.innerHTML = reportHTML;
}

// --- بداية: تعديلات على مصروفات ورواتب الشهر ---
function addWorkerSalaryField(name = '', salary = '') {
    const container = document.getElementById('salariesContainer');
    if (!container) return;
    const newItemDiv = document.createElement('div');
    newItemDiv.classList.add('worker-salary-item'); // استخدام فئة مخصصة أو entry-item
    newItemDiv.innerHTML = `
        <input type="text" class="workerName" placeholder="اسم العامل" value="${name}">
        <input type="number" class="workerSalary" placeholder="الراتب" step="0.01" value="${salary}">
        <button type="button" class="remove-button" onclick="this.parentElement.remove()">إزالة</button>
    `;
    container.appendChild(newItemDiv);
}

function addOtherMonthlyExpense() {
    const container = document.getElementById('otherMonthlyExpensesContainer');
    const newItemDiv = document.createElement('div');
    newItemDiv.classList.add('monthly-expense-item', 'entry-item');
    newItemDiv.innerHTML = `
        <input type="text" class="expenseName" placeholder="اسم المصروف الشهري">
        <input type="number" class="expenseAmount" placeholder="المبلغ" step="0.01">
        <button type="button" class="remove-button" onclick="this.parentElement.remove()">إزالة</button>
    `;
    container.appendChild(newItemDiv);
}

function saveMonthlyExpenses() {
    const monthYearInput = document.getElementById('reportMonth');
    if(!monthYearInput) return;
    const monthYear = monthYearInput.value;

    if (!monthYear) {
        alert("الرجاء تحديد الشهر والسنة أولاً.");
        return;
    }

    if (!database.monthlyExpenses[monthYear]) {
        database.monthlyExpenses[monthYear] = { workers: [], electricity: 0, rent: 0, other: [] };
    }

    // حفظ رواتب العمال
    database.monthlyExpenses[monthYear].workers = [];
    document.querySelectorAll('#salariesContainer .worker-salary-item').forEach(item => {
        const nameInp = item.querySelector('.workerName');
        const salaryInp = item.querySelector('.workerSalary');
        if (nameInp && salaryInp) {
            const name = nameInp.value;
            const salary = parseFloat(salaryInp.value);
            if (name && salary > 0) {
                database.monthlyExpenses[monthYear].workers.push({ name, salary });
            }
        }
    });

    const electricityInput = document.getElementById('electricity');
    const rentInput = document.getElementById('rent');
    database.monthlyExpenses[monthYear].electricity = electricityInput ? parseFloat(electricityInput.value) || 0 : 0;
    database.monthlyExpenses[monthYear].rent = rentInput ? parseFloat(rentInput.value) || 0 : 0;

    database.monthlyExpenses[monthYear].other = [];
    document.querySelectorAll('#otherMonthlyExpensesContainer .monthly-expense-item').forEach(item => {
        const nameInp = item.querySelector('.expenseName');
        const amountInp = item.querySelector('.expenseAmount');
        if (nameInp && amountInp) {
            const name = nameInp.value;
            const amount = parseFloat(amountInp.value);
            if (name && amount) {
                database.monthlyExpenses[monthYear].other.push({ name, amount });
            }
        }
    });
    const dataToSync = { path: `monthlyExpenses.${monthYear}`, value: database.monthlyExpenses[monthYear] };
    saveData(dataToSync, 'update_monthly_expenses'); // حفظ ومحاولة المزامنة
    // alert("تم حفظ المصروفات الشهرية بنجاح!"); // تم نقله لـ saveData
    generateMonthlyReport();
}

function loadMonthlyExpensesToForm() {
    const monthYearInput = document.getElementById('reportMonth');
    if (!monthYearInput) return;
    const monthYear = monthYearInput.value;
    const expenses = database.monthlyExpenses[monthYear] || { workers: [], electricity: 0, rent: 0, other: [] };

    const salariesContainer = document.getElementById('salariesContainer');
    if (salariesContainer) {
        salariesContainer.innerHTML = ''; // مسح الحقول القديمة
        (expenses.workers || []).forEach(worker => addWorkerSalaryField(worker.name, worker.salary));
    }
    if (!expenses.workers || expenses.workers.length === 0) { // إضافة حقل راتب واحد فارغ إذا لم يكن هناك عمال
        addWorkerSalaryField();
    }


    const electricityEl = document.getElementById('electricity');
    if (electricityEl) electricityEl.value = expenses.electricity || '';
    const rentEl = document.getElementById('rent');
    if (rentEl) rentEl.value = expenses.rent || '';

    const otherContainer = document.getElementById('otherMonthlyExpensesContainer');
    if(otherContainer) {
        otherContainer.innerHTML = '';
        (expenses.other || []).forEach(exp => {
            const newItemDiv = document.createElement('div');
            newItemDiv.classList.add('monthly-expense-item', 'entry-item');
            newItemDiv.innerHTML = `
                <input type="text" class="expenseName" value="${exp.name}" placeholder="اسم المصروف الشهري">
                <input type="number" class="expenseAmount" value="${exp.amount}" placeholder="المبلغ" step="0.01">
                <button type="button" class="remove-button" onclick="this.parentElement.remove()">إزالة</button>
            `;
            otherContainer.appendChild(newItemDiv);
        });
    }
}


function generateMonthlyReport() {
    const monthYearInput = document.getElementById('reportMonth');
    if (!monthYearInput) return;
    const monthYear = monthYearInput.value;
    const outputDiv = document.getElementById('monthlyReportOutput');
    if(!outputDiv) return;
    outputDiv.innerHTML = '';

    if (!monthYear) {
        outputDiv.innerHTML = '<p>الرجاء اختيار الشهر والسنة.</p>';
        return;
    }

    let totalMonthlySales = 0;
    let totalMonthlyPurchases = 0;
    let totalMonthlyDailyExpenses = 0;
    // تمت إزالة totalMonthlyReturns

    for (const date in database.dailyEntries) {
        if (date.startsWith(monthYear)) {
            ['morning', 'evening'].forEach(period => {
                if (database.dailyEntries[date][period] && database.dailyEntries[date][period].totals) {
                    const totals = database.dailyEntries[date][period].totals;
                    totalMonthlySales += totals.sales || 0;
                    totalMonthlyPurchases += totals.purchases || 0;
                    totalMonthlyDailyExpenses += totals.expenses || 0;
                    // تم حذف جمع المرتجعات
                }
            });
        }
    }
    loadMonthlyExpensesToForm(); // للتأكد من أن الحقول محملة بالبيانات الصحيحة قبل عرض التقرير

    const monthlyFixed = database.monthlyExpenses[monthYear] || { workers: [], electricity: 0, rent: 0, other: [] };
    let totalSalaries = 0;
    (monthlyFixed.workers || []).forEach(worker => totalSalaries += (worker.salary || 0));

    let totalOtherMonthlyExpenses = 0;
    (monthlyFixed.other || []).forEach(exp => totalOtherMonthlyExpenses += (exp.amount || 0));
    const totalFixedExpenses = totalSalaries + (monthlyFixed.electricity || 0) + (monthlyFixed.rent || 0) + totalOtherMonthlyExpenses;
    // تعديل صافي الربح الشهري
    const netMonthlyProfit = totalMonthlySales - (totalMonthlyPurchases + totalMonthlyDailyExpenses + totalFixedExpenses);

    let reportHTML = `<h3>التقرير الشهري لـ: ${monthYear}</h3>`;
    reportHTML += '<ul>';
    reportHTML += `<li>إجمالي المبيعات الشهري: ${totalMonthlySales.toFixed(2)} ريال</li>`;
    reportHTML += `<li>إجمالي المشتريات الشهري: ${totalMonthlyPurchases.toFixed(2)} ريال</li>`;
    reportHTML += `<li>إجمالي المصروفات اليومية المتراكمة: ${totalMonthlyDailyExpenses.toFixed(2)} ريال</li>`;
    // تم حذف عرض إجمالي المرتجعات
    reportHTML += '</ul>';
    reportHTML += `<div class="monthly-expenses-print-summary">`;
    reportHTML += '<h4>المصروفات الشهرية الثابتة:</h4>';
    reportHTML += '<ul>';
    if (totalSalaries > 0) {
        reportHTML += `<li><strong>إجمالي رواتب العمال:</strong> ${totalSalaries.toFixed(2)} ريال</li>`;
        (monthlyFixed.workers || []).forEach(worker => {
            reportHTML += `<li class="item-detail worker-salary-print-item"><em>- ${worker.name}: ${worker.salary.toFixed(2)} ريال</em></li>`;
        });
    }
    if (monthlyFixed.electricity > 0) reportHTML += `<li>فاتورة الكهرباء: ${monthlyFixed.electricity.toFixed(2)} ريال</li>`;
    if (monthlyFixed.rent > 0) reportHTML += `<li>الإيجار الشهري: ${monthlyFixed.rent.toFixed(2)} ريال</li>`;
    (monthlyFixed.other || []).forEach(exp => {
        if (exp.amount > 0) reportHTML += `<li>${exp.name}: ${exp.amount.toFixed(2)} ريال</li>`;
    });
    reportHTML += `<li class="total-line"><strong>إجمالي المصروفات الثابتة:</strong> ${totalFixedExpenses.toFixed(2)} ريال</li>`;
    reportHTML += '</ul>';
    reportHTML += `</div>`;
    reportHTML += `<p class="total-line"><strong>الربح/الخسارة الصافي للشهر: ${netMonthlyProfit.toFixed(2)} ريال</strong></p>`;

    outputDiv.innerHTML = reportHTML;
}
// --- نهاية: تعديلات على مصروفات ورواتب الشهر ---

function performSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    const searchTerm = searchInput.value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;
    resultsDiv.innerHTML = '';

    if (!searchTerm) {
        resultsDiv.innerHTML = '<p>الرجاء إدخال كلمة للبحث.</p>';
        return;
    }

    let foundItemsHTML = '<ul>';
    let foundCount = 0;

    for (const date in database.dailyEntries) {
        if (date.includes(searchTerm)) {
            foundCount++;
            foundItemsHTML += `<li><strong>بيانات يوم ${date}:</strong> <button onclick="document.getElementById('reportDate').value='${date}'; showView('dailyReportView'); generateDailyReport();">عرض التقرير</button></li>`;
        }

        ['morning', 'evening'].forEach(period => {
            if (database.dailyEntries[date][period]) {
                const dataSet = database.dailyEntries[date][period];
                ['purchases', 'sales', 'expenses'].forEach(category => { // تمت إزالة 'returns'
                    if (dataSet[category]) {
                        dataSet[category].forEach(item => {
                            const itemName = item.name ? item.name.toLowerCase() : '';
                            const itemPrice = item.price ? item.price.toString() : '';
                            if (itemName.includes(searchTerm) || itemPrice.includes(searchTerm)) {
                                foundCount++;
                                foundItemsHTML += `<li>${date} (${period === 'morning' ? 'ص' : 'م'}) - ${category}: ${item.name || ''} - ${item.price ? item.price.toFixed(2) : ''} ريال</li>`;
                            }
                        });
                    }
                });
            }
        });
    }
     // البحث في مصروفات العمال الشهرية (اسم العامل)
    for (const month in database.monthlyExpenses) {
        if (database.monthlyExpenses[month].workers) {
            database.monthlyExpenses[month].workers.forEach(worker => {
                if (worker.name.toLowerCase().includes(searchTerm) || worker.salary.toString().includes(searchTerm)) {
                    foundCount++;
                    foundItemsHTML += `<li>راتب شهري (${month}): ${worker.name} - ${worker.salary.toFixed(2)} ريال <button onclick="document.getElementById('reportMonth').value='${month}'; showView('monthlyReportView');">عرض التقرير الشهري</button></li>`;
                }
            });
        }
    }


    if (foundCount === 0) {
        resultsDiv.innerHTML = '<p>لم يتم العثور على نتائج.</p>';
    } else {
        resultsDiv.innerHTML = foundItemsHTML + '</ul>';
    }
}


function printCurrentReport(reportType) {
    let reportTitle = "";
    let reportDateStr = "";
    let totals = { purchases: 0, sales: 0, expenses: 0, net: 0 }; // تمت إزالة returns
    let fixedExpensesHTML = "";
    let salariesPrintHTML = ""; // لطباعة تفاصيل الرواتب

    const appName = "مطعم أبو ماجد";
    const logoSrc = document.getElementById('appLogo') ? document.getElementById('appLogo').src : 'img/logo.png'; // مصدر الشعار


    if (reportType === 'daily') {
        const reportDateValue = document.getElementById('reportDate').value;
        if (!reportDateValue || !database.dailyEntries[reportDateValue]) {
            alert("لا توجد بيانات لعرضها في التقرير اليومي المحدد.");
            return;
        }
        reportTitle = "التقرير اليومي";
        reportDateStr = reportDateValue;

        ['morning', 'evening'].forEach(period => {
            if (database.dailyEntries[reportDateValue][period] && database.dailyEntries[reportDateValue][period].totals) {
                const periodTotals = database.dailyEntries[reportDateValue][period].totals;
                totals.purchases += periodTotals.purchases || 0;
                totals.sales += periodTotals.sales || 0;
                totals.expenses += periodTotals.expenses || 0;
                // تم حذف جمع المرتجعات
            }
        });
        totals.net = totals.sales - (totals.purchases + totals.expenses);

    } else if (reportType === 'monthly') {
        const monthYearValue = document.getElementById('reportMonth').value;
        if (!monthYearValue) {
            alert("الرجاء تحديد الشهر للتقرير الشهري.");
            return;
        }
        reportTitle = "التقرير الشهري";
        reportDateStr = monthYearValue;
        let totalSalaries = 0;

        for (const dateKey in database.dailyEntries) {
            if (dateKey.startsWith(monthYearValue)) {
                ['morning', 'evening'].forEach(period => {
                    if (database.dailyEntries[dateKey][period] && database.dailyEntries[dateKey][period].totals) {
                        const dayTotals = database.dailyEntries[dateKey][period].totals;
                        totals.sales += dayTotals.sales || 0;
                        totals.purchases += dayTotals.purchases || 0;
                        totals.expenses += dayTotals.expenses || 0;
                        // تم حذف جمع المرتجعات
                    }
                });
            }
        }

        const monthlyFixed = database.monthlyExpenses[monthYearValue] || { workers: [], electricity: 0, rent: 0, other: [] };
        (monthlyFixed.workers || []).forEach(worker => totalSalaries += (worker.salary || 0));

        // بناء HTML لرواتب العمال في الطباعة
        if (totalSalaries > 0) {
            salariesPrintHTML = `<h4>رواتب العمال:</h4><ul>`;
            (monthlyFixed.workers || []).forEach(worker => {
                salariesPrintHTML += `<li class="worker-salary-print-item">${worker.name}: ${worker.salary.toFixed(2)} ريال</li>`;
            });
            salariesPrintHTML += `<li class="total-line"><strong>إجمالي الرواتب:</strong> ${totalSalaries.toFixed(2)} ريال</li></ul>`;
        }


        let totalOtherFixed = 0;
        (monthlyFixed.other || []).forEach(exp => totalOtherFixed += exp.amount);
        const totalAllFixedExpenses = totalSalaries + (monthlyFixed.electricity || 0) + (monthlyFixed.rent || 0) + totalOtherFixed;

        fixedExpensesHTML = `<h4>المصروفات الشهرية الثابتة الأخرى:</h4><ul>`;
        if (monthlyFixed.electricity > 0) fixedExpensesHTML += `<li>فاتورة الكهرباء: ${monthlyFixed.electricity.toFixed(2)} ريال</li>`;
        if (monthlyFixed.rent > 0) fixedExpensesHTML += `<li>الإيجار الشهري: ${monthlyFixed.rent.toFixed(2)} ريال</li>`;
        (monthlyFixed.other || []).forEach(exp => {
            if(exp.amount > 0) fixedExpensesHTML += `<li>${exp.name}: ${exp.amount.toFixed(2)} ريال</li>`;
        });
         if (!(monthlyFixed.electricity > 0) && !(monthlyFixed.rent > 0) && monthlyFixed.other.length === 0) {
            fixedExpensesHTML = ""; // لا تعرض العنوان إذا لم تكن هناك مصروفات أخرى
        } else {
             fixedExpensesHTML += `<li class="total-line"><strong>إجمالي المصروفات الأخرى:</strong> ${( (monthlyFixed.electricity || 0) + (monthlyFixed.rent || 0) + totalOtherFixed).toFixed(2)} ريال</li></ul>`;
        }


        totals.expenses += totalAllFixedExpenses; // إضافة المصروفات الثابتة إلى إجمالي المصروفات الشهرية
        totals.net = totals.sales - (totals.purchases + totals.expenses);
    } else {
        return;
    }

    const printWindow = window.open('', '_blank', 'height=700,width=800');
    printWindow.document.write('<html><head><title>طباعة التقرير</title>');
    printWindow.document.write(`
        <style>
            body { font-family: Arial, sans-serif; direction: rtl; margin: 20px; }
            .print-header { text-align: center; margin-bottom: 30px; }
            .print-header img { max-height: 60px; margin-bottom: 10px; }
            .print-header h1 { font-size: 18pt; margin: 0; }
            h2, h3, h4 { text-align: center; color: #333; }
            h2 { font-size: 16pt; margin-bottom: 5px;}
            h3 { font-size: 14pt; margin-bottom: 20px;}
            h4 { font-size: 13pt; margin-top: 15px; text-align: right; border-bottom: 1px solid #666; padding-bottom: 3px;}
            ul { list-style-type: none; padding-right: 0; margin-bottom: 15px;}
            li { padding: 6px 0; border-bottom: 1px dotted #ccc; }
            li:last-child { border-bottom: none; }
            .worker-salary-print-item { padding-right: 15px; font-style: italic; }
            .total-line { margin-top: 10px; }
            .total-line strong { font-weight: bold; color: #000; font-size: 1.1em; }
        </style>
    `);
    printWindow.document.write('</head><body>');
    // إضافة الشعار واسم المطعم في الأعلى
    printWindow.document.write(`<div class="print-header">`);
    if (logoSrc && logoSrc !== window.location.href) { // تحقق من وجود مصدر صالح للشعار
         printWindow.document.write(`<img src="${logoSrc}" alt="شعار ${appName}">`);
    }
    printWindow.document.write(`<h1>${appName}</h1>`);
    printWindow.document.write(`</div>`);

    printWindow.document.write(`<h2>${reportTitle}</h2>`);
    printWindow.document.write(`<h3>التاريخ: ${reportDateStr}</h3>`);

    printWindow.document.write('<h4>ملخص الإجماليات:</h4>');
    printWindow.document.write('<ul>');
    printWindow.document.write(`<li>إجمالي المبيعات: ${totals.sales.toFixed(2)} ريال</li>`);
    printWindow.document.write(`<li>إجمالي المشتريات: ${totals.purchases.toFixed(2)} ريال</li>`);
    if (reportType === 'daily') {
        printWindow.document.write(`<li>إجمالي المصروفات (اليومية): ${totals.expenses.toFixed(2)} ريال</li>`);
    } else {
         let dailyExpForMonthlyPrint = 0;
         for (const dateKey in database.dailyEntries) {
            if (dateKey.startsWith(reportDateStr)) {
                ['morning', 'evening'].forEach(period => {
                    if (database.dailyEntries[dateKey][period] && database.dailyEntries[dateKey][period].totals) {
                        dailyExpForMonthlyPrint += database.dailyEntries[dateKey][period].totals.expenses || 0;
                    }
                });
            }
        }
        printWindow.document.write(`<li>إجمالي المصروفات اليومية المتراكمة: ${dailyExpForMonthlyPrint.toFixed(2)} ريال</li>`);
    }
    // تم حذف المرتجعات من الطباعة
    printWindow.document.write('</ul>');

    if (reportType === 'monthly') {
        if(salariesPrintHTML) printWindow.document.write(salariesPrintHTML);
        if(fixedExpensesHTML) printWindow.document.write(fixedExpensesHTML);
        printWindow.document.write(`<p class="total-line"><strong>الصافي الشهري الكلي: ${totals.net.toFixed(2)} ريال</strong></p>`);
    } else {
        printWindow.document.write(`<p class="total-line"><strong>الصافي اليومي الكلي: ${totals.net.toFixed(2)} ريال</strong></p>`);
    }

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
}
