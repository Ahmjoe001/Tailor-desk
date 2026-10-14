// TailorDesk frontend: authentication and the authenticated workspace.
const THEME_STORAGE_KEY = "tailordesk-theme";
const ORDER_STATUSES = ["pending", "in_progress", "completed", "collected", "cancelled"];

function applyTheme(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selectedTheme;
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        const nextTheme = selectedTheme === "dark" ? "light" : "dark";
        const label = nextTheme === "dark" ? "Dark mode" : "Light mode";
        const icon = nextTheme === "dark" ? "🌙" : "☀️";
        button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
        button.setAttribute("aria-pressed", String(selectedTheme === "dark"));
        button.querySelector(".theme-icon").textContent = icon;
        button.querySelector(".theme-label").textContent = label;
    });
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "light");
document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
    });
});

const SUPABASE_URL = "https://yvbzjmbjrsqttrhpazba.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_AsJ9ex0pnYgru4UJk_Rh2Q_NogrsyIU";
const authStorage = {
    getItem(key) {
        return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    },
    setItem(key, value) {
        const rememberCheckbox = document.querySelector("#remember");
        const remember = rememberCheckbox
            ? rememberCheckbox.checked
            : window.localStorage.getItem("tailordesk-remember-session") !== "false";
        const storage = remember ? window.localStorage : window.sessionStorage;
        const otherStorage = remember ? window.sessionStorage : window.localStorage;
        otherStorage.removeItem(key);
        storage.setItem(key, value);
    },
    removeItem(key) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
    }
};
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: authStorage }
});

const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const recoveryForm = document.querySelector("#recovery-form");
const dashboard = document.querySelector(".view-panel");

function showLoginMessage(message, isError = false) {
    const color = isError ? "#c0392b" : "#26734d";
    if (loginMessage) {
        loginMessage.textContent = message;
        loginMessage.style.color = color;
    }
    const recoveryMessage = document.querySelector("#recovery-message");
    if (recoveryMessage) {
        recoveryMessage.textContent = message;
        recoveryMessage.style.color = color;
    }
}

if (loginForm) {
    const emailInput = document.querySelector("#email");
    const passwordInput = document.querySelector("#password");
    const rememberCheckbox = document.querySelector("#remember");
    const togglePasswordButton = document.querySelector("#toggle-password");
    const forgotPasswordButton = document.querySelector("#forgot-password");

    togglePasswordButton?.addEventListener("click", () => {
        const isHidden = passwordInput.type === "password";
        passwordInput.type = isHidden ? "text" : "password";
        togglePasswordButton.textContent = isHidden ? "Hide" : "Show";
    });

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!supabaseClient) {
            showLoginMessage("The sign-in service could not be loaded. Refresh and try again.", true);
            return;
        }

        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        window.localStorage.setItem("tailordesk-remember-session", String(rememberCheckbox.checked));
        showLoginMessage("Signing you in...");
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value
            });
            if (error) throw error;
            window.location.href = "dashboard.html";
        } catch (error) {
            showLoginMessage(error.message || "Unable to sign in. Please try again.", true);
        } finally {
            submitButton.disabled = false;
        }
    });

    forgotPasswordButton?.addEventListener("click", async () => {
        if (!supabaseClient) {
            showLoginMessage("The sign-in service could not be loaded. Refresh and try again.", true);
            return;
        }
        const email = emailInput.value.trim();
        if (!email) {
            emailInput.focus();
            showLoginMessage("Enter your email address first, then choose Forgot password.", true);
            return;
        }

        forgotPasswordButton.disabled = true;
        showLoginMessage("Sending password reset instructions...");
        try {
            const redirectTo = new URL("index.html", window.location.href).toString();
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) throw error;
            showLoginMessage("If an account exists for that address, password reset instructions have been sent.");
        } catch (error) {
            showLoginMessage(error.message || "Unable to send reset instructions.", true);
        } finally {
            forgotPasswordButton.disabled = false;
        }
    });

    if (recoveryForm && supabaseClient) {
        const showRecoveryForm = () => {
            loginForm.hidden = true;
            recoveryForm.hidden = false;
            showLoginMessage("Set a new password to finish recovering your account.");
        };

        supabaseClient.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") showRecoveryForm();
        });

        if (window.location.hash.includes("type=recovery")) showRecoveryForm();

        recoveryForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const newPassword = document.querySelector("#new-password").value;
            const submitButton = recoveryForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            showLoginMessage("Updating your password...");
            try {
                const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
                if (error) throw error;
                const { error: signOutError } = await supabaseClient.auth.signOut();
                if (signOutError) throw signOutError;
                recoveryForm.hidden = true;
                loginForm.hidden = false;
                recoveryForm.reset();
                showLoginMessage("Password updated. You can now sign in.");
            } catch (error) {
                showLoginMessage(error.message || "Unable to update your password.", true);
            } finally {
                submitButton.disabled = false;
            }
        });
    }
}

if (dashboard) {
    startDashboard().catch((error) => {
        setWorkspaceMessage(error.message || "Unable to load your workspace.", true);
    });
}

function setWorkspaceMessage(message, isError = false) {
    const target = document.querySelector("#workspace-message");
    if (!target) return;
    target.textContent = message;
    target.style.color = isError ? "#a2372b" : "#8a5a22";
}

function showWorkspaceError(error) {
    setWorkspaceMessage(error.message || "Unable to complete the requested action.", true);
}

async function startDashboard() {
    if (!supabaseClient) {
        throw new Error("The Supabase client could not be loaded. Refresh and try again.");
    }

    const { data, error } = await supabaseClient.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw error;
    if (!data.user) {
        window.location.replace("index.html");
        return;
    }
    await verifyTailorProfile(data.user.id);

    const state = { user: data.user, customers: [], measurements: [], orders: [], payments: [] };
    const customerMap = new Map();
    const orderMap = new Map();
    const dialog = document.querySelector("#record-dialog");
    const recordForm = document.querySelector("#record-form");
    const dialogFields = document.querySelector("#dialog-fields");
    let selectedCustomerId = null;
    let currentOperation = null;

    document.querySelector("#profile-email").textContent = state.user.email || "TailorDesk User";

    document.querySelector("#logout-button").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const { error: signOutError } = await supabaseClient.auth.signOut();
            if (signOutError) throw signOutError;
            window.location.replace("index.html");
        } catch (error) {
            setWorkspaceMessage(error.message || "Unable to sign out. Please try again.", true);
            button.disabled = false;
        }
    });

    document.querySelectorAll("[data-view]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            showView(link.dataset.view);
        });
    });
    window.addEventListener("hashchange", () => {
        const requestedView = window.location.hash.slice(1);
        showView(requestedView);
    });

    document.querySelectorAll('button[data-action^="add-"]').forEach((button) => {
        button.addEventListener("click", () => openRecordDialog(button.dataset.action).catch(showWorkspaceError));
    });
    document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
    document.querySelector("#dialog-cancel").addEventListener("click", () => dialog.close());
    recordForm.addEventListener("submit", saveDialogRecord);
    document.querySelector("#customer-search").addEventListener("input", renderCustomers);
    document.querySelector("#order-search").addEventListener("input", renderOrders);
    document.querySelector("#order-status-filter").addEventListener("change", renderOrders);
    document.querySelector("#measurement-customer-filter").addEventListener("change", renderMeasurements);
    document.querySelector("#customers-table").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#orders-table").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#measurements-table").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#profile-measurements").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#profile-orders").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "view-order" || button.dataset.action === "edit-order") {
            openRecordDialog(button.dataset.action, button.dataset.id).catch(showWorkspaceError);
        } else if (button.dataset.action === "pay-order") {
            openRecordDialog("add-payment", null, null, button.dataset.id).catch(showWorkspaceError);
        }
    });
    document.querySelector("#customer-profile").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "profile-add-order") {
            openRecordDialog("add-order", null, selectedCustomerId).catch(showWorkspaceError);
        } else if (button.dataset.action === "profile-add-measurement") {
            openRecordDialog("add-measurement", null, selectedCustomerId).catch(showWorkspaceError);
        } else if (button.dataset.action === "profile-edit-customer") {
            openRecordDialog("edit-customer", selectedCustomerId).catch(showWorkspaceError);
        }
    });

    function showView(viewName) {
        const panel = document.querySelector(`#view-${viewName}`);
        const target = panel ? viewName : "overview";
        document.querySelectorAll(".view-panel").forEach((section) => {
            section.hidden = section.id !== `view-${target}`;
        });
        document.querySelectorAll("[data-view]").forEach((link) => {
            link.classList.toggle("active", link.dataset.view === target);
        });
        document.querySelector("#page-title").textContent = panel?.dataset.title || "Welcome to TailorDesk.";
        document.querySelector("#page-subtitle").textContent = panel?.dataset.subtitle || "";
        if (window.location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
    }

    async function loadWorkspace() {
        setWorkspaceMessage("Loading your workspace...");
        const [customersResult, measurementsResult, ordersResult] = await Promise.all([
            supabaseClient.from("customers").select("id,tailor_id,full_name,phone,address,notes,material_received_date,created_at").eq("tailor_id", state.user.id).order("created_at", { ascending: false }),
            supabaseClient.from("measurements").select("id,tailor_id,customer_id,measurement_name,measurement_value,unit,created_at").eq("tailor_id", state.user.id).order("created_at", { ascending: false }),
            supabaseClient.from("orders").select("id,tailor_id,customer_id,clothing_style,clothing_type,style_name,design_description,fabric_image_path,style_image_path,sewing_instructions,material_received_date,total_amount,amount_paid,collection_date,status,notes,created_at").eq("tailor_id", state.user.id).order("created_at", { ascending: false })
        ]);
        for (const result of [customersResult, measurementsResult, ordersResult]) {
            if (result.error) throw result.error;
        }

        state.customers = customersResult.data || [];
        state.measurements = measurementsResult.data || [];
        state.orders = ordersResult.data || [];
        customerMap.clear();
        orderMap.clear();
        state.customers.forEach((customer) => customerMap.set(customer.id, customer));
        state.orders.forEach((order) => orderMap.set(order.id, order));

        const paymentsResult = await supabaseClient.from("payments")
            .select("id,tailor_id,order_id,amount,payment_date,method,created_at")
            .eq("tailor_id", state.user.id)
            .order("payment_date", { ascending: false });
        if (paymentsResult.error) {
            state.payments = [];
            const notice = document.querySelector("#payments-notice");
            notice.textContent = paymentsResult.error.message.toLowerCase().includes("relation") &&
                paymentsResult.error.message.toLowerCase().includes("payments")
                ? "Payment history is not installed yet. Apply payments-schema.sql in the Supabase SQL Editor to enable it."
                : `Payment history could not be loaded: ${paymentsResult.error.message}`;
            notice.hidden = false;
        } else {
            state.payments = paymentsResult.data || [];
            document.querySelector("#payments-notice").hidden = true;
        }

        renderAll();
        setWorkspaceMessage("");
    }

    function renderAll() {
        renderCustomers();
        renderMeasurements();
        renderOrders();
        renderPayments();
        renderDashboardStats();
        populateFilters();
        if (selectedCustomerId) {
            renderCustomerProfile().catch((error) => {
                setWorkspaceMessage(`Unable to load the customer profile: ${error.message}`, true);
            });
        }
    }

    function populateFilters() {
        const customerSelect = document.querySelector("#measurement-customer-filter");
        const currentCustomer = customerSelect.value;
        customerSelect.replaceChildren(makeOption("", "All customers"));
        state.customers.forEach((customer) => customerSelect.append(makeOption(customer.id, customer.full_name)));
        customerSelect.value = currentCustomer;

        const statusFilter = document.querySelector("#order-status-filter");
        const currentStatus = statusFilter.value;
        statusFilter.replaceChildren(makeOption("", "All statuses"));
        ORDER_STATUSES.forEach((status) => statusFilter.append(makeOption(status, status.replace("_", " "))));
        statusFilter.value = currentStatus;
    }

    function renderCustomers() {
        const query = document.querySelector("#customer-search").value.trim().toLowerCase();
        const rows = state.customers.filter((customer) =>
            `${customer.full_name || ""} ${customer.phone || ""}`.toLowerCase().includes(query)
        );
        const body = document.querySelector("#customers-table");
        body.replaceChildren();
        rows.forEach((customer) => {
            const row = document.createElement("tr");
            appendCell(row, customer.full_name);
            appendCell(row, customer.phone);
            appendCell(row, customer.address);
            appendCell(row, formatDate(customer.material_received_date));
            appendCell(row, customer.notes);
            appendActions(row, customer.id, ["view-customer", "edit-customer", "delete-customer"]);
            body.append(row);
        });
        showEmpty("#customers-empty", rows.length === 0);
    }

    function renderMeasurements() {
        const customerId = document.querySelector("#measurement-customer-filter").value;
        const rows = state.measurements.filter((measurement) => !customerId || measurement.customer_id === customerId);
        const body = document.querySelector("#measurements-table");
        body.replaceChildren();
        rows.forEach((measurement) => {
            const row = document.createElement("tr");
            appendCell(row, customerMap.get(measurement.customer_id)?.full_name || "Unknown customer");
            appendCell(row, measurement.measurement_name);
            appendCell(row, measurement.measurement_value);
            appendCell(row, measurement.unit);
            appendActions(row, measurement.id, ["edit-measurement", "delete-measurement"]);
            body.append(row);
        });
        showEmpty("#measurements-empty", rows.length === 0);
    }

    function renderOrders() {
        const query = document.querySelector("#order-search").value.trim().toLowerCase();
        const status = document.querySelector("#order-status-filter").value;
        const rows = state.orders.filter((order) => {
            const customer = customerMap.get(order.customer_id);
            const matchesText = `${customer?.full_name || ""} ${order.clothing_style || ""}`.toLowerCase().includes(query);
            return matchesText && (!status || order.status === status);
        });
        const body = document.querySelector("#orders-table");
        body.replaceChildren();
        rows.forEach((order) => {
            const customer = customerMap.get(order.customer_id);
            const row = document.createElement("tr");
            appendCell(row, customer?.full_name || "Unknown customer");
            appendCell(row, `${order.clothing_type || ""} ${order.style_name || order.clothing_style || ""}`.trim());
            appendCell(row, formatDate(order.material_received_date));
            appendCell(row, formatDate(order.created_at));
            appendCell(row, formatDate(order.collection_date));
            appendCell(row, formatMoney(order.total_amount));
            appendCell(row, formatMoney(order.amount_paid));
            appendCell(row, formatMoney(balance(order)));
            appendCell(row, order.status);
            appendActions(row, order.id, ["view-order", "edit-order", "delete-order"]);
            body.append(row);
        });
        showEmpty("#orders-empty", rows.length === 0);
    }

    function renderPayments() {
        const body = document.querySelector("#payments-table");
        body.replaceChildren();
        state.payments.forEach((payment) => {
            const order = orderMap.get(payment.order_id);
            const row = document.createElement("tr");
            appendCell(row, formatDate(payment.payment_date));
            appendCell(row, customerMap.get(order?.customer_id)?.full_name || "Unknown customer");
            appendCell(row, order?.clothing_style || "Order unavailable");
            appendCell(row, payment.method);
            appendCell(row, formatMoney(payment.amount));
            body.append(row);
        });
        showEmpty("#payments-empty", state.payments.length === 0);
    }

    async function renderCustomerProfile() {
        const customer = customerMap.get(selectedCustomerId);
        const panel = document.querySelector("#customer-profile");
        if (!customer) {
            panel.hidden = true;
            return;
        }
        panel.hidden = false;
        document.querySelector("#customer-profile-name").textContent = customer.full_name;
        document.querySelector("#customer-profile-subtitle").textContent = customer.phone || "";

        const details = document.querySelector("#customer-profile-details");
        details.replaceChildren();
        [
            ["Phone", customer.phone],
            ["Address", customer.address],
            ["Material first received", formatDate(customer.material_received_date)],
            ["General notes", customer.notes]
        ].forEach(([title, value]) => {
            const wrapper = document.createElement("div");
            const term = document.createElement("dt");
            const description = document.createElement("dd");
            term.textContent = title;
            description.textContent = value || "—";
            wrapper.append(term, description);
            details.append(wrapper);
        });

        const measurements = state.measurements.filter((item) => item.customer_id === customer.id);
        const measurementBody = document.querySelector("#profile-measurements");
        measurementBody.replaceChildren();
        measurements.forEach((measurement) => {
            const row = document.createElement("tr");
            appendCell(row, measurement.measurement_name);
            appendCell(row, measurement.measurement_value);
            appendCell(row, measurement.unit);
            appendActions(row, measurement.id, ["edit-measurement", "delete-measurement"]);
            measurementBody.append(row);
        });
        showEmpty("#profile-measurements-empty", measurements.length === 0);

        const orders = state.orders.filter((item) => item.customer_id === customer.id);
        const orderList = document.querySelector("#profile-orders");
        orderList.replaceChildren();
        for (const order of orders) {
            const card = document.createElement("article");
            card.className = "profile-order-card";
            const title = document.createElement("h4");
            title.textContent = [order.clothing_type, order.style_name || order.clothing_style].filter(Boolean).join(" — ");
            const info = document.createElement("p");
            info.textContent = `Status: ${order.status || "Pending"} · Collection: ${formatDate(order.collection_date)} · Material received: ${formatDate(order.material_received_date)}`;
            const price = document.createElement("p");
            price.textContent = `Total ${formatMoney(order.total_amount)} · Paid ${formatMoney(order.amount_paid)} · Balance ${formatMoney(balance(order))}`;
            card.append(title, info, price);
            if (order.design_description) appendProfileParagraph(card, "Design", order.design_description);
            if (order.sewing_instructions) appendProfileParagraph(card, "Instructions", order.sewing_instructions);
            if (order.notes) appendProfileParagraph(card, "Other details", order.notes);
            const images = document.createElement("div");
            images.className = "order-images";
            card.append(images);
            await appendOrderImages(images, order);
            const actions = document.createElement("div");
            actions.className = "profile-actions";
            appendActionButton(actions, "view-order", order.id, "Details");
            appendActionButton(actions, "edit-order", order.id, "Edit");
            if (balance(order) > 0) appendActionButton(actions, "pay-order", order.id, "Record payment");
            card.append(actions);
            orderList.append(card);
        }
        showEmpty("#profile-orders-empty", orders.length === 0);

        const customerOrderIds = new Set(orders.map((item) => item.id));
        const customerPayments = state.payments.filter((payment) => customerOrderIds.has(payment.order_id));
        const paymentBody = document.querySelector("#profile-payments");
        paymentBody.replaceChildren();
        customerPayments.forEach((payment) => {
            const row = document.createElement("tr");
            appendCell(row, formatDate(payment.payment_date));
            appendCell(row, orderMap.get(payment.order_id)?.style_name ||
                orderMap.get(payment.order_id)?.clothing_style || "Order");
            appendCell(row, payment.method);
            appendCell(row, formatMoney(payment.amount));
            paymentBody.append(row);
        });
        showEmpty("#profile-payments-empty", customerPayments.length === 0);
    }

    function appendProfileParagraph(parent, label, value) {
        const paragraph = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        paragraph.append(strong, document.createTextNode(value));
        parent.append(paragraph);
    }

    function appendActionButton(parent, action, id, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action-button";
        button.dataset.action = action;
        button.dataset.id = id;
        button.textContent = label;
        parent.append(button);
    }

    async function appendOrderImages(container, order) {
        const entries = [
            ["Fabric / material", order.fabric_image_path],
            ["Desired style", order.style_image_path]
        ];
        for (const [label, path] of entries) {
            if (!path) continue;
            const item = document.createElement("a");
            item.className = "order-image";
            item.target = "_blank";
            item.rel = "noopener noreferrer";
            const image = document.createElement("img");
            image.alt = label;
            image.loading = "lazy";
            const caption = document.createElement("span");
            caption.textContent = label;
            item.append(image, caption);
            container.append(item);
            try {
                const { data, error } = await supabaseClient.storage
                    .from("tailordesk-order-images")
                    .createSignedUrl(path, 3600);
                if (error) throw error;
                image.src = data.signedUrl;
                item.href = data.signedUrl;
            } catch (error) {
                caption.textContent = `${label}: ${error.message}`;
            }
        }
    }

    function renderDashboardStats() {
        const activeOrders = state.orders.filter((order) =>
            !["completed", "cancelled", "collected"].includes(String(order.status || "").toLowerCase())
        );
        const outstanding = state.orders.reduce((sum, order) => sum + balance(order), 0);
        document.querySelector("#stat-customers").textContent = String(state.customers.length);
        document.querySelector("#stat-orders").textContent = String(activeOrders.length);
        document.querySelector("#stat-balance").textContent = formatMoney(outstanding);

        const body = document.querySelector("#recent-orders");
        body.replaceChildren();
        state.orders.slice(0, 5).forEach((order) => {
            const row = document.createElement("tr");
            appendCell(row, customerMap.get(order.customer_id)?.full_name || "Unknown customer");
            appendCell(row, order.clothing_style);
            appendCell(row, formatDate(order.created_at));
            appendCell(row, formatDate(order.collection_date));
            appendCell(row, order.status);
            body.append(row);
        });
        showEmpty("#recent-orders-empty", state.orders.length === 0);
    }

    function appendCell(row, value) {
        const cell = document.createElement("td");
        cell.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
        row.append(cell);
    }

    function appendActions(row, id, actions) {
        const cell = document.createElement("td");
        actions.forEach((action) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `action-button${action.startsWith("delete-") ? " danger" : ""}`;
            button.dataset.action = action;
            button.dataset.id = id;
            button.textContent = ({
                "view-customer": "Profile",
                "view-order": "Details",
                "edit-customer": "Edit",
                "edit-order": "Edit",
                "edit-measurement": "Edit",
                "delete-customer": "Delete",
                "delete-order": "Delete",
                "delete-measurement": "Delete"
            })[action];
            cell.append(button);
        });
        row.append(cell);
    }

    function showEmpty(selector, visible) {
        document.querySelector(selector).hidden = !visible;
    }

    function makeOption(value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }

    function formatMoney(value) {
        const amount = Number(value);
        return `₦${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString();
    }

    function balance(order) {
        return Math.max(0, Number(order.total_amount || 0) - Number(order.amount_paid || 0));
    }

    function customerOptions() {
        return state.customers.map((customer) => ({ value: customer.id, label: customer.full_name }));
    }

    function fieldsFor(operation, record, presetCustomerId, presetOrderId) {
        const customerField = { name: "customer_id", label: "Customer", type: "select", required: true, value: presetCustomerId, options: customerOptions() };
        if (operation.endsWith("customer")) {
            return [
                { name: "full_name", label: "Full name", required: true, maxLength: 150 },
                { name: "phone", label: "Phone number", required: true, maxLength: 40 },
                { name: "address", label: "Address", type: "textarea" },
                { name: "notes", label: "General notes", type: "textarea" },
                { name: "material_received_date", label: "Date material was first received", type: "date", required: true }
            ];
        }
        if (operation.endsWith("measurement")) {
            return [
                customerField,
                { name: "measurement_name", label: "Measurement name", required: true, maxLength: 100, list: "measurement-name-suggestions", placeholder: "Select a common measurement or enter your own" },
                { name: "measurement_value", label: "Value", type: "number", required: true, min: "0.01", step: "any" },
                { name: "unit", label: "Unit", placeholder: "e.g. cm or inches", maxLength: 20 }
            ];
        }
        if (operation.endsWith("order")) {
            const fields = [
                customerField,
                { name: "clothing_type", label: "Clothing type", required: true, placeholder: "e.g. Shirt, dress, trousers" },
                { name: "style_name", label: "Style name", required: true, placeholder: "e.g. Senator set, A-line dress" },
                { name: "design_description", label: "Requested design description", type: "textarea" },
                { name: "fabric_image", label: "Fabric / material picture", type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", help: "Image file up to 8 MB. Leave blank to keep the current picture." },
                { name: "style_image", label: "Desired clothing style picture", type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", help: "Image file up to 8 MB. Leave blank to keep the current picture." },
                { name: "sewing_instructions", label: "Sewing instructions and details", type: "textarea" },
                { name: "material_received_date", label: "Date material was received", type: "date", required: true },
                { name: "collection_date", label: "Expected collection date", type: "date", required: true, min: record ? undefined : new Date().toISOString().slice(0, 10) },
                { name: "total_amount", label: "Total price (₦)", type: "number", required: true, min: "0.01", step: "0.01" }
            ];
            fields.push(
                { name: "status", label: "Order status", type: "select", required: true, options: [
                    { value: "pending", label: "Pending" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "completed", label: "Completed" },
                    { value: "collected", label: "Collected" },
                    { value: "cancelled", label: "Cancelled" }
                ] },
                { name: "notes", label: "Other order details", type: "textarea" }
            );
            return fields;
        }
        if (operation === "add-payment") {
            const outstandingOrders = state.orders.filter((order) => balance(order) > 0);
            return [
                { name: "order_id", label: "Order", type: "select", required: true, value: presetOrderId, options: outstandingOrders.map((order) => ({
                    value: order.id,
                    label: `${customerMap.get(order.customer_id)?.full_name || "Customer"} — ${order.clothing_style} (${formatMoney(balance(order))} due)`
                })) },
                { name: "amount", label: "Payment amount (₦)", type: "number", required: true, min: "0.01", step: "0.01" },
                { name: "payment_date", label: "Payment date", type: "date", required: true, value: new Date().toISOString().slice(0, 10) },
                { name: "method", label: "Payment method", type: "select", options: [
                    { value: "cash", label: "Cash" },
                    { value: "transfer", label: "Bank transfer" },
                    { value: "card", label: "Card" },
                    { value: "other", label: "Other" }
                ] }
            ];
        }
        return [];
    }

    async function openRecordDialog(operation, recordId, presetCustomerId, presetOrderId) {
        if (operation === "add-measurement" && state.customers.length === 0) {
            setWorkspaceMessage("Add a customer before recording measurements.", true);
            showView("customers");
            return;
        }
        if (operation === "add-order" && state.customers.length === 0) {
            setWorkspaceMessage("Add a customer before creating an order.", true);
            showView("customers");
            return;
        }
        if (operation === "add-payment" && !state.orders.some((order) => balance(order) > 0)) {
            setWorkspaceMessage("There are no orders with an outstanding balance.", true);
            return;
        }

        const recordType = operation.split("-").at(-1);
        const source = recordType === "customer" ? state.customers
            : recordType === "measurement" ? state.measurements : state.orders;
        const record = recordId ? source.find((item) => item.id === recordId) : null;
        if (operation === "view-customer") {
            selectedCustomerId = recordId;
            await renderCustomerProfile();
            document.querySelector("#customer-profile").scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (operation === "view-order") {
            await showOrderDetails(record);
            return;
        }

        currentOperation = { name: operation, record };
        recordForm.reset();
        dialogFields.replaceChildren();
        document.querySelector("#dialog-message").textContent = "";
        document.querySelector("#dialog-title").textContent =
            `${record ? "Edit" : "Add"} ${recordType === "payment" ? "payment" : recordType}`;
        document.querySelector("#dialog-submit").disabled = false;
        document.querySelector("#dialog-submit").hidden = false;

        fieldsFor(operation, record, presetCustomerId, presetOrderId).forEach((field) => {
            const wrapper = document.createElement("div");
            wrapper.className = "dialog-field";
            const label = document.createElement("label");
            label.htmlFor = `record-${field.name}`;
            label.textContent = field.label;
            const input = field.type === "select" ? document.createElement("select")
                : field.type === "textarea" ? document.createElement("textarea")
                    : document.createElement("input");
            input.id = label.htmlFor;
            input.name = field.name;
            if (field.type !== "select" && field.type !== "textarea") input.type = field.type || "text";
            input.required = Boolean(field.required);
            if (field.placeholder) input.placeholder = field.placeholder;
            if (field.min !== undefined) input.min = field.min;
            if (field.maxLength !== undefined) input.maxLength = field.maxLength;
            if (field.step !== undefined) input.step = field.step;
            if (field.accept) input.accept = field.accept;
            if (field.list) input.setAttribute("list", field.list);
            if (field.type === "select") {
                input.append(makeOption("", `Select ${field.label.toLowerCase()}`));
                field.options.forEach((option) => input.append(makeOption(option.value, option.label)));
            }
            const legacyValue = field.name === "style_name"
                ? record?.clothing_style
                : field.name === "clothing_type" && record ? "Other" : undefined;
            const value = record?.[field.name] ?? legacyValue ??
                (field.name === "status" ? "pending" : field.value) ??
                (field.name === "unit" ? "cm" : "");
            if (input.type !== "file" && value !== null && value !== undefined) input.value = String(value);
            wrapper.append(label, input);
            if (field.help) {
                const help = document.createElement("span");
                help.className = "upload-help";
                help.textContent = field.help;
                wrapper.append(help);
            }
            dialogFields.append(wrapper);
        });
        dialog.showModal();
    }

    async function showOrderDetails(order) {
        if (!order) return;
        dialogFields.replaceChildren();
        document.querySelector("#dialog-title").textContent = "Order details";
        document.querySelector("#dialog-message").textContent = "";
        document.querySelector("#dialog-submit").hidden = true;
        const customer = customerMap.get(order.customer_id);
        const entries = [
            ["Customer", customer?.full_name || "Unknown customer"],
            ["Phone", customer?.phone || "—"],
            ["Clothing type", order.clothing_type],
            ["Style name", order.style_name || order.clothing_style],
            ["Design description", order.design_description],
            ["Sewing instructions", order.sewing_instructions],
            ["Material received", formatDate(order.material_received_date)],
            ["Order date", formatDate(order.created_at)],
            ["Collection date", formatDate(order.collection_date)],
            ["Total", formatMoney(order.total_amount)],
            ["Paid", formatMoney(order.amount_paid)],
            ["Balance", formatMoney(balance(order))],
            ["Status", order.status],
            ["Notes", order.notes || "—"]
        ];
        entries.forEach(([labelText, value]) => {
            const line = document.createElement("p");
            const label = document.createElement("strong");
            label.textContent = `${labelText}: `;
            line.append(label, document.createTextNode(String(value ?? "—")));
            dialogFields.append(line);
        });
        const images = document.createElement("div");
        images.className = "order-images";
        await appendOrderImages(images, order);
        dialogFields.append(images);
        dialog.showModal();
    }

    async function getVerifiedTailorId() {
        const { data, error } = await supabaseClient.auth.getUser();
        if (error) throw error;
        if (!data.user) throw new Error("Your session has expired. Sign in again before saving a customer.");

        await verifyTailorProfile(data.user.id);
        state.user = data.user;
        return data.user.id;
    }

    async function uploadOrderImage(file, tailorId, orderId, imageType) {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowedTypes.includes(file.type)) {
            throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
        }
        if (file.size > 8 * 1024 * 1024) {
            throw new Error("Each order image must be 8 MB or smaller.");
        }
        document.querySelector("#dialog-message").textContent = "Uploading images and saving the order...";
        const extension = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
        }[file.type];
        const path = `${tailorId}/${orderId}/${imageType}-${crypto.randomUUID()}.${extension}`;
        const { data, error } = await supabaseClient.storage
            .from("tailordesk-order-images")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        return data.path;
    }

    async function saveDialogRecord(event) {
        event.preventDefault();
        if (!currentOperation) return;
        const submit = document.querySelector("#dialog-submit");
        let saveWarning = "";
        submit.disabled = true;
        document.querySelector("#dialog-message").textContent = "Saving...";
        try {
            const values = Object.fromEntries(new FormData(recordForm).entries());
            const { name: operation, record } = currentOperation;
            if (operation === "add-payment") {
                const order = orderMap.get(values.order_id);
                const amount = Number(values.amount);
                if (!order || !Number.isFinite(amount) || amount <= 0 || amount > balance(order)) {
                    throw new Error("Enter a positive payment no greater than the outstanding balance.");
                }
                const { error } = await supabaseClient.rpc("record_payment", {
                    p_order_id: values.order_id,
                    p_amount: amount,
                    p_payment_date: values.payment_date,
                    p_method: values.method || null
                });
                if (error) throw error;
            } else {
                const table = operation.endsWith("customer") ? "customers"
                    : operation.endsWith("measurement") ? "measurements" : "orders";
                const tailorId = table === "customers" && !record
                    ? await getVerifiedTailorId()
                    : state.user.id;
                let payload;
                if (table === "customers") {
                    payload = {
                        full_name: values.full_name.trim(),
                        phone: values.phone.trim(),
                        address: values.address.trim() || null,
                        notes: values.notes.trim() || null,
                        material_received_date: values.material_received_date || null
                    };
                } else if (table === "measurements") {
                    const value = Number(values.measurement_value);
                    if (!Number.isFinite(value) || value <= 0) throw new Error("Measurement value must be a positive number.");
                    payload = { customer_id: values.customer_id, measurement_name: values.measurement_name.trim(), measurement_value: value, unit: values.unit.trim() || null };
                } else {
                    const clothingType = values.clothing_type.trim();
                    const styleName = values.style_name.trim();
                    const total = Number(values.total_amount);
                    const paid = record ? Number(record.amount_paid || 0) : 0;
                    const status = values.status || "pending";
                    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid) || paid < 0 || paid > total) {
                        throw new Error("Enter a positive total price. Amount paid cannot exceed the total price.");
                    }
                    if (!ORDER_STATUSES.includes(status)) {
                        throw new Error("Choose a valid order status.");
                    }
                    const orderId = record?.id || crypto.randomUUID();
                    const uploadedPaths = [];
                    try {
                        const fabricFile = recordForm.elements.fabric_image.files[0];
                        const styleFile = recordForm.elements.style_image.files[0];
                        payload = {
                            id: orderId,
                            customer_id: values.customer_id,
                            clothing_type: clothingType,
                            style_name: styleName,
                            clothing_style: `${clothingType} — ${styleName}`,
                            design_description: values.design_description.trim() || null,
                            sewing_instructions: values.sewing_instructions.trim() || null,
                            material_received_date: values.material_received_date || null,
                            collection_date: values.collection_date,
                            total_amount: total,
                            amount_paid: paid,
                            status,
                            notes: values.notes.trim() || null,
                            fabric_image_path: record?.fabric_image_path || null,
                            style_image_path: record?.style_image_path || null
                        };
                        if (fabricFile) {
                            payload.fabric_image_path = await uploadOrderImage(fabricFile, tailorId, orderId, "fabric");
                            uploadedPaths.push(payload.fabric_image_path);
                        }
                        if (styleFile) {
                            payload.style_image_path = await uploadOrderImage(styleFile, tailorId, orderId, "style");
                            uploadedPaths.push(payload.style_image_path);
                        }

                        let query = supabaseClient.from(table);
                        if (record) {
                            query = query.update(payload).eq("id", record.id).eq("tailor_id", tailorId).select("id").maybeSingle();
                        } else {
                            payload.tailor_id = tailorId;
                            query = query.insert(payload).select("id").single();
                        }
                        const { data, error } = await query;
                        if (error) throw error;
                        if (!data) throw new Error("No order was changed. Check that your account can access this order.");

                        const replacedPaths = [];
                        if (fabricFile && record?.fabric_image_path) replacedPaths.push(record.fabric_image_path);
                        if (styleFile && record?.style_image_path) replacedPaths.push(record.style_image_path);
                        if (replacedPaths.length) {
                            const { error: removeError } = await supabaseClient.storage
                                .from("tailordesk-order-images")
                                .remove(replacedPaths);
                            if (removeError) saveWarning = `Order saved, but an old image could not be removed: ${removeError.message}`;
                        }
                    } catch (error) {
                        if (uploadedPaths.length) {
                            const { error: cleanupError } = await supabaseClient.storage
                                .from("tailordesk-order-images")
                                .remove(uploadedPaths);
                            if (cleanupError) {
                                throw new Error(`${error.message} Uploaded image cleanup also failed: ${cleanupError.message}`);
                            }
                        }
                        throw error;
                    }
                }
                if (table !== "orders") {
                    let query = supabaseClient.from(table);
                    if (record) {
                        query = query.update(payload).eq("id", record.id).eq("tailor_id", tailorId).select("id").maybeSingle();
                    } else {
                        payload.tailor_id = tailorId;
                        query = query.insert(payload).select("id").single();
                    }
                    const { data, error } = await query;
                    if (error) throw error;
                    if (!data) throw new Error("No record was changed. Check that your account can access this record.");
                }
            }
            dialog.close();
            currentOperation = null;
            await loadWorkspace();
            setWorkspaceMessage(saveWarning || "Saved successfully.", Boolean(saveWarning));
        } catch (error) {
            document.querySelector("#dialog-message").textContent = error.message || "Unable to save this record.";
            document.querySelector("#dialog-message").style.color = "#a2372b";
        } finally {
            submit.disabled = false;
        }
    }

    async function handleTableAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const { action, id } = button.dataset;
        if (action === "view-customer") {
            selectedCustomerId = id;
            await renderCustomerProfile();
            document.querySelector("#customer-profile").scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (action.startsWith("edit-")) {
            await openRecordDialog(action, id);
            return;
        }
        if (action === "view-order") {
            await openRecordDialog(action, id);
            return;
        }
        const type = action.split("-")[1];
        const table = type === "customer" ? "customers" : type === "measurement" ? "measurements" : "orders";
        const record = (type === "customer" ? state.customers : type === "measurement" ? state.measurements : state.orders)
            .find((item) => item.id === id);
        const label = type === "customer" ? record?.full_name : type === "measurement" ? record?.measurement_name : record?.clothing_style;
        if (!window.confirm(`Delete ${label || "this record"}? This cannot be undone.`)) return;
        button.disabled = true;
        let deleteWarning = "";
        try {
            const { data, error } = await supabaseClient.from(table)
                .delete().eq("id", id).eq("tailor_id", state.user.id).select("id").maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("No record was deleted. Check that your account can access this record.");
            if (type === "order") {
                const paths = [record?.fabric_image_path, record?.style_image_path].filter(Boolean);
                if (paths.length) {
                    const { error: storageError } = await supabaseClient.storage
                        .from("tailordesk-order-images")
                        .remove(paths);
                    if (storageError) {
                        deleteWarning = `Order deleted, but its images could not be removed: ${storageError.message}`;
                    }
                }
            }
            if (type === "customer" && selectedCustomerId === id) {
                selectedCustomerId = null;
                document.querySelector("#customer-profile").hidden = true;
            }
            await loadWorkspace();
            setWorkspaceMessage(deleteWarning || "Deleted successfully.", Boolean(deleteWarning));
        } catch (error) {
            setWorkspaceMessage(error.message || "Unable to delete this record.", true);
            button.disabled = false;
        }

    }

    showView(window.location.hash.slice(1) || "overview");
    await loadWorkspace();
}

async function verifyTailorProfile(userId) {
    const { data, error } = await supabaseClient.rpc("ensure_tailor_profile");

    if (error) {
        throw new Error(
            `Could not verify your tailor profile: ${error.message}. Run profiles-schema.sql in the Supabase SQL Editor.`
        );
    }
    if (data !== userId) {
        throw new Error("The verified profile ID does not match your authenticated user ID.");
    }
    return data;
}
