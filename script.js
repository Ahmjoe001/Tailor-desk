// TailorDesk frontend: authentication and the authenticated workspace.
const THEME_STORAGE_KEY = "tailordesk-theme";
const ORDER_STATUSES = ["pending", "in_progress", "completed", "collected", "cancelled"];
const MEASUREMENT_SECTIONS = [
    {
        title: "Upper body",
        fields: [
            ["neck", "Neck"],
            ["upper_chest", "Upper chest"],
            ["chest_bust", "Chest/Bust"],
            ["shoulder_width", "Shoulder width"],
            ["shoulder_to_bust", "Shoulder to bust"],
            ["shoulder_to_underbust", "Shoulder to underbust"],
            ["shoulder_to_waist", "Shoulder to waist"],
            ["top_length", "Top length"],
            ["front_length", "Front length"],
            ["back_length", "Back length"],
            ["armhole", "Armhole"],
            ["sleeve_length", "Sleeve length"],
            ["upper_arm_bicep", "Upper arm/Bicep"],
            ["elbow", "Elbow"],
            ["wrist", "Wrist"],
            ["across_chest", "Across chest"],
            ["across_back", "Across back"]
        ]
    },
    {
        title: "Lower body",
        fields: [
            ["waist", "Waist"],
            ["trouser_waist", "Trouser waist"],
            ["hip", "Hip"],
            ["waist_to_hip", "Waist to hip"],
            ["thigh", "Thigh"],
            ["knee", "Knee"],
            ["calf", "Calf"],
            ["trouser_length", "Trouser length"],
            ["inseam", "Inseam"],
            ["outseam", "Outseam"],
            ["crotch_length", "Crotch length"],
            ["crotch_depth", "Crotch depth"],
            ["leg_opening", "Leg opening"],
            ["rise", "Rise"]
        ]
    },
    {
        title: "Dress and gown",
        fields: [
            ["full_length", "Full length"],
            ["shoulder_to_knee", "Shoulder to knee"],
            ["shoulder_to_floor", "Shoulder to floor"],
            ["bust_point_distance", "Bust point distance"],
            ["underbust", "Underbust"],
            ["dress_waist", "Dress waist"],
            ["dress_hip", "Dress hip"],
            ["dress_length", "Dress length"],
            ["jacket_length", "Jacket length"],
            ["skirt_length", "Skirt length"],
            ["other_measurements", "Other measurements"]
        ]
    }
];

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

function legacyMeasurementKey(name) {
    const normalizedName = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const aliases = {
        chest: "chest_bust",
        bust: "chest_bust",
        hips: "hip",
        shoulder: "shoulder_width",
        bicep: "upper_arm_bicep",
        "upper arm": "upper_arm_bicep",
        "trouser waist": "waist"
    };
    if (aliases[normalizedName]) return aliases[normalizedName];
    for (const section of MEASUREMENT_SECTIONS) {
        const match = section.fields.find(([, label]) =>
            label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedName
        );
        if (match) return match[0];
    }
    return null;
}

function measurementUnitCode(value) {
    const rawUnit = String(value || "cm").trim().toLowerCase();
    if (["in", "inch", "inches"].includes(rawUnit)) return "in";
    if (["cm", "centimeter", "centimeters", "centimetre", "centimetres"].includes(rawUnit)) return "cm";
    return null;
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
    const signupButton = document.querySelector("#signup-button");
    const signupNameField = document.querySelector("#signup-name-field");
    const signupNameInput = document.querySelector("#signup-name");
    let isSigningUp = false;

    signupButton?.addEventListener("click", () => {
        isSigningUp = !isSigningUp;
        signupNameField.hidden = !isSigningUp;
        signupNameInput.required = isSigningUp;
        signupButton.textContent = isSigningUp ? "Back to sign in" : "Create a tailor account";
        loginForm.querySelector('button[type="submit"] span:first-child').textContent = isSigningUp ? "Create Account" : "Sign In";
        showLoginMessage(isSigningUp ? "Enter your name, email, and password to create your tailor account." : "");
        if (isSigningUp) signupNameInput.focus();
    });

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
        showLoginMessage(isSigningUp ? "Creating your tailor account..." : "Signing you in...");
        try {
            const result = isSigningUp
                ? await supabaseClient.auth.signUp({
                    email: emailInput.value.trim(),
                    password: passwordInput.value,
                    options: { data: { full_name: signupNameInput.value.trim() } }
                })
                : await supabaseClient.auth.signInWithPassword({
                    email: emailInput.value.trim(),
                    password: passwordInput.value
                });
            const { data, error } = result;
            if (error) throw error;
            if (isSigningUp && !data.session) {
                showLoginMessage("Account created. Check your email to confirm it, then sign in.");
                isSigningUp = false;
                signupNameField.hidden = true;
                signupNameInput.required = false;
                signupButton.textContent = "Create a tailor account";
                submitButton.querySelector("span:first-child").textContent = "Sign In";
            } else {
                if (isSigningUp) showLoginMessage("Account created. Opening your workspace...");
                window.location.href = "dashboard.html";
            }
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

if (loginForm && supabaseClient && !window.location.hash.includes("type=recovery")) {
    supabaseClient.auth.getUser().then(({ data, error }) => {
        if (error && error.name !== "AuthSessionMissingError") throw error;
        if (data.user) window.location.replace("dashboard.html");
    }).catch((error) => {
        showLoginMessage(error.message || "Unable to check your sign-in session.", true);
    });
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
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.replace("index.html");
    });

    const state = {
        user: data.user,
        customers: [],
        measurements: [],
        measurementSets: [],
        measurementSetsAvailable: true,
        orders: [],
        payments: [],
        paymentHistoryAvailable: true
    };
    const customerMap = new Map();
    const orderMap = new Map();
    const dialog = document.querySelector("#record-dialog");
    const recordForm = document.querySelector("#record-form");
    const dialogFields = document.querySelector("#dialog-fields");
    const profileSettingsForm = document.querySelector("#profile-settings-form");
    const selectedCustomerStorageKey = `tailordesk-selected-customer-${state.user.id}`;
    let selectedCustomerId = window.sessionStorage.getItem(selectedCustomerStorageKey);
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
    profileSettingsForm.addEventListener("submit", saveProfileSettings);

    document.querySelectorAll('button[data-action^="add-"]').forEach((button) => {
        button.addEventListener("click", () => {
            openRecordDialog(button.dataset.action, null).catch(showWorkspaceError);
        });
    });
    document.querySelector('[data-action="go-customers"]').addEventListener("click", () => showView("customers"));
    document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
    document.querySelector("#dialog-cancel").addEventListener("click", () => dialog.close());
    recordForm.addEventListener("submit", saveDialogRecord);
    document.querySelector("#customer-search").addEventListener("input", renderCustomers);
    document.querySelector("#customers-table").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#measurements-table").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#profile-measurements").addEventListener("click", (event) => handleTableAction(event).catch(showWorkspaceError));
    document.querySelector("#profile-orders").addEventListener("click", (event) => {
        const paymentForm = event.target.closest("form[data-order-payment]");
        if (paymentForm) return;
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "view-order" || button.dataset.action === "edit-order") {
            openRecordDialog(button.dataset.action, button.dataset.id).catch(showWorkspaceError);
        } else if (button.dataset.action === "delete-order") {
            handleTableAction(event).catch(showWorkspaceError);
        }
    });
    document.querySelector("#profile-orders").addEventListener("submit", (event) => {
        const paymentForm = event.target.closest("form[data-order-payment]");
        if (paymentForm) recordInlinePayment(event, paymentForm).catch(showWorkspaceError);
    });
    document.querySelector("#payments-orders").addEventListener("submit", (event) => {
        const paymentForm = event.target.closest("form[data-order-payment]");
        if (paymentForm) recordInlinePayment(event, paymentForm).catch(showWorkspaceError);
    });
    document.querySelector("#customer-profile").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "profile-add-order") {
            openRecordDialog("add-order", null, selectedCustomerId).catch(showWorkspaceError);
        } else if (button.dataset.action === "profile-add-measurements") {
            openRecordDialog("add-measurement", null, selectedCustomerId).catch(showWorkspaceError);
        } else if (button.dataset.action === "profile-edit-customer") {
            openRecordDialog("edit-customer", selectedCustomerId).catch(showWorkspaceError);
        }
    });

    function showView(viewName) {
        const target = ["overview", "customers", "measurements", "payments", "settings"].includes(viewName) ? viewName : "customers";
        const panel = document.querySelector(`#view-${target}`);
        document.querySelectorAll(".view-panel").forEach((section) => {
            section.hidden = section.id !== `view-${target}`;
        });
        document.querySelectorAll("[data-view]").forEach((link) => {
            link.classList.toggle("active", link.dataset.view === target);
        });
        document.querySelector("#page-title").textContent = panel?.dataset.title || "Welcome to TailorDesk.";
        document.querySelector("#page-subtitle").textContent = panel?.dataset.subtitle || "";
        if (window.location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
        if (target === "settings") loadProfileSettings().catch(showWorkspaceError);
    }

    async function loadProfileSettings() {
        setWorkspaceMessage("Loading profile settings...");
        const { data, error } = await supabaseClient.rpc("get_my_tailor_profile");
        if (error) {
            throw new Error(`Profile settings are unavailable. Review profile-settings-migration.sql before applying it: ${error.message}`);
        }
        const profile = Array.isArray(data) ? data[0] : data;
        if (!profile) throw new Error("No profile was returned for the signed-in tailor.");
        profileSettingsForm.elements.full_name.value = profile.full_name || "";
        profileSettingsForm.elements.shop_name.value = profile.shop_name || "";
        profileSettingsForm.elements.account_email.value = state.user.email || "";
        setWorkspaceMessage("");
    }

    async function saveProfileSettings(event) {
        event.preventDefault();
        const submit = profileSettingsForm.querySelector('button[type="submit"]');
        const fullName = profileSettingsForm.elements.full_name.value.trim();
        const shopName = profileSettingsForm.elements.shop_name.value.trim();
        if (!fullName || !shopName) {
            setWorkspaceMessage("Your name and business name are required.", true);
            return;
        }

        submit.disabled = true;
        setWorkspaceMessage("Saving profile settings...");
        try {
            const { error } = await supabaseClient.rpc("update_my_tailor_profile", {
                p_full_name: fullName,
                p_shop_name: shopName
            });
            if (error) throw error;
            setWorkspaceMessage("Profile settings saved.");
        } catch (error) {
            setWorkspaceMessage(error.message || "Unable to save profile settings.", true);
        } finally {
            submit.disabled = false;
        }
    }

    async function loadWorkspace() {
        setWorkspaceMessage("Loading your workspace...");
        const [customersResult, measurementsResult, measurementSetsResult, ordersResult] = await Promise.all([
            supabaseClient.from("customers").select("id,tailor_id,full_name,phone,address,notes,material_received_date,created_at").eq("tailor_id", state.user.id).order("created_at", { ascending: false }),
            supabaseClient.from("measurements").select("id,tailor_id,customer_id,measurement_name,measurement_value,unit,created_at").eq("tailor_id", state.user.id).order("created_at", { ascending: false }),
            supabaseClient.from("customer_measurement_sets").select("customer_id,tailor_id,measurements,unit,notes,updated_at").eq("tailor_id", state.user.id),
            supabaseClient.from("orders").select("id,tailor_id,customer_id,clothing_style,clothing_type,style_name,design_description,fabric_image_path,style_image_path,sewing_instructions,material_received_date,total_amount,amount_paid,collection_date,status,notes,created_at,measurement_data").eq("tailor_id", state.user.id).order("created_at", { ascending: false })
        ]);
        const measurementSetError = measurementSetsResult.error;
        const measurementSetErrorText = String(measurementSetError?.message || "").toLowerCase();
        if (measurementSetError &&
            (measurementSetError.code === "42P01" ||
                (measurementSetErrorText.includes("customer_measurement_sets") &&
                    (measurementSetErrorText.includes("does not exist") ||
                        measurementSetErrorText.includes("could not find") ||
                        measurementSetErrorText.includes("schema cache"))))) {
            state.measurementSetsAvailable = false;
        } else if (measurementSetError) {
            throw measurementSetError;
        }
        let ordersResultFinal = ordersResult;
        state.garmentMeasurementsAvailable = true;
        if (ordersResult.error && /measurement_data/i.test(ordersResult.error.message || "")) {
            state.garmentMeasurementsAvailable = false;
            ordersResultFinal = await supabaseClient.from("orders")
                .select("id,tailor_id,customer_id,clothing_style,clothing_type,style_name,design_description,fabric_image_path,style_image_path,sewing_instructions,material_received_date,total_amount,amount_paid,collection_date,status,notes,created_at")
                .eq("tailor_id", state.user.id).order("created_at", { ascending: false });
        }
        for (const result of [customersResult, measurementsResult, ordersResultFinal]) {
            if (result.error) throw result.error;
        }

        state.customers = customersResult.data || [];
        state.measurements = measurementsResult.data || [];
        state.measurementSets = measurementSetsResult.data || [];
        state.orders = ordersResultFinal.data || [];
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
            state.paymentHistoryAvailable = false;
            state.paymentHistoryError = paymentsResult.error.message.toLowerCase().includes("relation") &&
                paymentsResult.error.message.toLowerCase().includes("payments")
                ? "Payment history is not installed. Review payments-schema.sql to enable payment recording."
                : `Payment history could not be loaded: ${paymentsResult.error.message}`;
        } else {
            state.paymentHistoryAvailable = true;
            state.paymentHistoryError = "";
            state.payments = paymentsResult.data || [];
        }

        renderAll();
        setWorkspaceMessage(state.paymentHistoryError || (!state.measurementSetsAvailable
            ? "Full customer measurement sets are not installed. Apply measurement-sets-schema.sql to enable them."
            : !state.garmentMeasurementsAvailable
                ? "Garment-specific measurements are not installed yet. Review garment-measurements-migration.sql before applying it."
                : ""));
    }

    function renderAll() {
        renderCustomers();
        renderMeasurements();
        renderPayments();
        renderDashboardStats();
        if (selectedCustomerId) {
            renderCustomerProfile().catch((error) => {
                setWorkspaceMessage(`Unable to load the customer profile: ${error.message}`, true);
            });
        }
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
            appendCell(row, formatDate(customer.created_at));
            appendCell(row, customer.notes);
            appendActions(row, customer.id, ["view-customer", "edit-customer", "delete-customer"]);
            body.append(row);
        });
        showEmpty("#customers-empty", rows.length === 0);
    }

    function appendLegacyMeasurementRow(measurement, body, includeCustomer) {
        const set = getMeasurementSet(measurement.customer_id);
        const key = legacyMeasurementKey(measurement.measurement_name);
        const currentValue = key ? set?.measurements?.[key] : null;
        const sameUnit = set && measurementUnitCode(set.unit) === measurementUnitCode(measurement.unit);
        if (currentValue !== null && currentValue !== undefined && currentValue !== "" &&
            Number(currentValue) === Number(measurement.measurement_value) && sameUnit) {
            return;
        }

        const row = document.createElement("tr");
        if (includeCustomer) appendCell(row, customerMap.get(measurement.customer_id)?.full_name || "Unknown customer");
        appendCell(row, set && key ? `Previous ${measurement.measurement_name}` : measurement.measurement_name);
        appendCell(row, measurement.measurement_value);
        appendCell(row, measurement.unit);
        appendActions(row, measurement.id, ["edit-measurement", "delete-measurement"]);
        body.append(row);
    }

    function appendMeasurementSetRows(measurementSets, body, includeCustomer) {
        measurementSets.forEach((set) => {
            let hasValues = false;
            MEASUREMENT_SECTIONS.forEach((section) => {
                section.fields.forEach(([key, label]) => {
                    const value = set.measurements?.[key];
                    if (value === null || value === undefined || value === "") return;
                    hasValues = true;
                    const row = document.createElement("tr");
                    if (includeCustomer) appendCell(row, customerMap.get(set.customer_id)?.full_name || "Unknown customer");
                    appendCell(row, label);
                    appendCell(row, value);
                    appendCell(row, set.unit);
                    appendActions(row, set.customer_id, ["edit-measurement-set"]);
                    body.append(row);
                });
            });
            if (set.notes) {
                const row = document.createElement("tr");
                if (includeCustomer) appendCell(row, customerMap.get(set.customer_id)?.full_name || "Unknown customer");
                appendCell(row, "Fitting notes");
                appendCell(row, set.notes);
                appendCell(row, "");
                appendActions(row, set.customer_id, ["edit-measurement-set"]);
                body.append(row);
            }
        });
    }

    function renderMeasurements() {
        const body = document.querySelector("#measurements-table");
        body.replaceChildren();
        const appendMeasurementRow = (customerId, recordType, measurement, value, unit, garment, id, actions) => {
            const row = document.createElement("tr");
            appendCell(row, customerMap.get(customerId)?.full_name || "Unknown customer");
            appendCell(row, recordType);
            appendCell(row, measurement);
            appendCell(row, value);
            appendCell(row, unit);
            appendCell(row, garment);
            appendActions(row, id, actions);
            body.append(row);
        };

        state.measurementSets.forEach((set) => {
            MEASUREMENT_SECTIONS.forEach((section) => {
                section.fields.forEach(([key, label]) => {
                    const value = set.measurements?.[key];
                    if (value === null || value === undefined || value === "") return;
                    appendMeasurementRow(set.customer_id, "Customer set", label, value, set.unit, "Customer", set.customer_id, ["edit-measurement-set"]);
                });
            });
            if (set.notes) {
                appendMeasurementRow(set.customer_id, "Customer set", "Fitting notes", set.notes, "", "Customer", set.customer_id, ["edit-measurement-set"]);
            }
        });

        state.measurements.forEach((measurement) => {
            const set = getMeasurementSet(measurement.customer_id);
            const key = legacyMeasurementKey(measurement.measurement_name);
            const setValue = key ? set?.measurements?.[key] : null;
            const sameUnit = set && measurementUnitCode(set.unit) === measurementUnitCode(measurement.unit);
            if (setValue !== null && setValue !== undefined && setValue !== "" &&
                Number(setValue) === Number(measurement.measurement_value) && sameUnit) return;
            appendMeasurementRow(
                measurement.customer_id,
                "Individual",
                set && key ? `Previous ${measurement.measurement_name}` : measurement.measurement_name,
                measurement.measurement_value,
                measurement.unit,
                "Customer",
                measurement.id,
                ["edit-measurement", "delete-measurement"]
            );
        });

        if (state.garmentMeasurementsAvailable) {
            state.orders.forEach((order) => {
                const values = order.measurement_data?.values;
                if (!values || typeof values !== "object") return;
                const unit = measurementUnitCode(order.measurement_data.unit) || "cm";
                MEASUREMENT_SECTIONS.forEach((section) => {
                    section.fields.forEach(([key, label]) => {
                        const value = values[key];
                        if (value === null || value === undefined || value === "") return;
                        appendMeasurementRow(
                            order.customer_id,
                            "Garment",
                            label,
                            value,
                            unit,
                            order.style_name || order.clothing_style || order.clothing_type,
                            order.id,
                            ["edit-order"]
                        );
                    });
                });
            });
        }
        showEmpty("#measurements-empty", body.rows.length === 0);
    }

    function renderPayments() {
        const container = document.querySelector("#payments-orders");
        container.replaceChildren();
        state.orders.forEach((order) => {
            const card = document.createElement("article");
            card.className = "profile-order-card";
            const heading = document.createElement("h4");
            const customer = customerMap.get(order.customer_id);
            heading.textContent = `${customer?.full_name || "Unknown customer"} — ${order.style_name || order.clothing_style || order.clothing_type || "Order"}`;
            const summary = document.createElement("p");
            summary.textContent = `Total ${formatMoney(order.total_amount)} · Paid ${formatMoney(order.amount_paid)} · Balance ${formatMoney(balance(order))} · Collection: ${formatDate(order.collection_date)} · Status: ${order.status || "Pending"}`;
            card.append(heading, summary);
            appendOrderPaymentSection(card, order);
            container.append(card);
        });
        showEmpty("#payments-empty", state.orders.length === 0);
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
            ["Date registered", formatDate(customer.created_at)],
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
        const measurementSets = state.measurementSets.filter((set) => set.customer_id === customer.id);
        const measurementBody = document.querySelector("#profile-measurements");
        measurementBody.replaceChildren();
        appendMeasurementSetRows(measurementSets, measurementBody, false);
        measurements.forEach((measurement) => appendLegacyMeasurementRow(measurement, measurementBody, false));
        showEmpty("#profile-measurements-empty", measurements.length === 0 && measurementSets.length === 0);

        const orders = state.orders.filter((item) => item.customer_id === customer.id);
        const totals = orders.reduce((summary, order) => ({
            total: summary.total + Number(order.total_amount || 0),
            paid: summary.paid + Number(order.amount_paid || 0),
            balance: summary.balance + balance(order)
        }), { total: 0, paid: 0, balance: 0 });
        document.querySelector("#profile-total").textContent = formatMoney(totals.total);
        document.querySelector("#profile-paid").textContent = formatMoney(totals.paid);
        document.querySelector("#profile-balance").textContent = formatMoney(totals.balance);
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
            const measurementData = order.measurement_data;
            if (measurementData?.values && Object.keys(measurementData.values).length) {
                const measurementGrid = document.createElement("div");
                measurementGrid.className = "order-measurements";
                const unit = measurementUnitCode(measurementData.unit) || "cm";
                MEASUREMENT_SECTIONS.forEach((section) => section.fields.forEach(([key, label]) => {
                    const value = measurementData.values[key];
                    if (value === null || value === undefined || value === "") return;
                    const chip = document.createElement("span");
                    const name = document.createElement("strong");
                    name.textContent = `${label}: `;
                    chip.append(name, document.createTextNode(`${value} ${unit}`));
                    measurementGrid.append(chip);
                }));
                card.append(measurementGrid);
            }
            if (order.design_description) appendProfileParagraph(card, "Design", order.design_description);
            if (order.sewing_instructions) appendProfileParagraph(card, "Instructions", order.sewing_instructions);
            if (order.notes) appendProfileParagraph(card, "Other details", order.notes);
            appendOrderPaymentSection(card, order);
            const images = document.createElement("div");
            images.className = "order-images";
            card.append(images);
            await appendOrderImages(images, order);
            const actions = document.createElement("div");
            actions.className = "profile-actions";
            appendActionButton(actions, "view-order", order.id, "Details");
            appendActionButton(actions, "edit-order", order.id, "Edit");
            appendActionButton(actions, "delete-order", order.id, "Delete");
            card.append(actions);
            orderList.append(card);
        }
        showEmpty("#profile-orders-empty", orders.length === 0);

    }

    function appendOrderPaymentSection(card, order) {
        const section = document.createElement("section");
        section.className = "garment-payment";
        const heading = document.createElement("h5");
        heading.textContent = "Payments for this item";
        section.append(heading);

        const transactions = state.payments.filter((payment) => payment.order_id === order.id);
        const history = document.createElement("ul");
        history.className = "garment-payment-history";
        transactions.forEach((payment) => {
            const item = document.createElement("li");
            item.textContent = `${formatDate(payment.payment_date)} · ${formatMoney(payment.amount)}${payment.method ? ` · ${payment.method}` : ""}`;
            history.append(item);
        });
        if (!transactions.length) {
            const item = document.createElement("li");
            item.textContent = state.paymentHistoryAvailable ? "No payments recorded for this item yet." : (state.paymentHistoryError || "Payment history is unavailable.");
            history.append(item);
        }
        section.append(history);

        if (state.paymentHistoryAvailable && balance(order) > 0) {
            const form = document.createElement("form");
            form.className = "inline-payment-form";
            form.dataset.orderPayment = "true";
            form.dataset.orderId = order.id;
            const amount = document.createElement("input");
            amount.name = "amount";
            amount.type = "number";
            amount.min = "0.01";
            amount.max = balance(order).toFixed(2);
            amount.step = "0.01";
            amount.placeholder = "Amount to record";
            amount.setAttribute("aria-label", "Payment amount");
            amount.required = true;
            const date = document.createElement("input");
            date.name = "payment_date";
            date.type = "date";
            date.value = new Date().toISOString().slice(0, 10);
            date.setAttribute("aria-label", "Payment date");
            date.required = true;
            const method = document.createElement("select");
            method.name = "method";
            method.setAttribute("aria-label", "Payment method");
            method.append(makeOption("", "Method"), makeOption("cash", "Cash"), makeOption("transfer", "Bank transfer"), makeOption("card", "Card"), makeOption("other", "Other"));
            const submit = document.createElement("button");
            submit.type = "submit";
            submit.className = "primary-button";
            submit.textContent = "Add payment";
            const message = document.createElement("p");
            message.className = "payment-form-message";
            message.setAttribute("role", "status");
            message.setAttribute("aria-live", "polite");
            const preview = document.createElement("p");
            preview.className = "payment-balance-preview";
            const updatePreview = () => {
                const entered = Number(amount.value || 0);
                const due = balance(order) - entered;
                preview.textContent = entered > 0 && due >= 0
                    ? `Balance after payment: ${formatMoney(due)}`
                    : entered > balance(order) ? "Payment exceeds the outstanding balance." : `Balance due: ${formatMoney(balance(order))}`;
                preview.classList.toggle("is-error", entered > balance(order));
            };
            amount.addEventListener("input", updatePreview);
            updatePreview();
            form.append(amount, date, method, preview, submit, message);
            section.append(form);
        }
        card.append(section);
    }

    async function recordInlinePayment(event, form) {
        event.preventDefault();
        const orderId = form.dataset.orderId;
        const order = orderMap.get(orderId);
        const values = Object.fromEntries(new FormData(form).entries());
        const amount = Number(values.amount);
        const message = form.querySelector(".payment-form-message");
        const submit = form.querySelector('button[type="submit"]');
        if (!order || !Number.isFinite(amount) || amount <= 0 || amount > balance(order)) {
            message.textContent = "Enter a positive payment no greater than this item's outstanding balance.";
            return;
        }
        submit.disabled = true;
        message.textContent = "Saving payment...";
        try {
            const { error } = await supabaseClient.rpc("record_payment", {
                p_order_id: orderId,
                p_amount: amount,
                p_payment_date: values.payment_date,
                p_method: values.method || null
            });
            if (error) throw error;
            await loadWorkspace();
            setWorkspaceMessage("Payment recorded.");
        } catch (error) {
            message.textContent = error.message || "Unable to record this payment.";
            submit.disabled = false;
        }
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
        const readyOrders = state.orders.filter((order) => String(order.status || "").toLowerCase() === "completed");
        const completedOrders = state.orders.filter((order) => ["completed", "collected"].includes(String(order.status || "").toLowerCase()));
        const outstanding = state.orders.reduce((sum, order) => sum + balance(order), 0);
        document.querySelector("#stat-customers").textContent = String(state.customers.length);
        document.querySelector("#stat-orders").textContent = String(activeOrders.length);
        document.querySelector("#stat-ready").textContent = String(readyOrders.length);
        document.querySelector("#stat-completed").textContent = String(completedOrders.length);
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
                "edit-measurement-set": "Edit set",
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
                { name: "unit", label: "Unit", type: "select", options: [
                    { value: "cm", label: "Centimetres (cm)" },
                    { value: "in", label: "Inches (in)" }
                ] }
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

    function getMeasurementSet(customerId) {
        return state.measurementSets.find((set) => set.customer_id === customerId) || null;
    }

    function getLegacyMeasurementSet(customerId) {
        const measurements = {};
        let unit = "cm";
        let firstUnit = null;
        state.measurements
            .filter((measurement) => measurement.customer_id === customerId)
            .forEach((measurement) => {
                const key = legacyMeasurementKey(measurement.measurement_name);
                const measurementUnit = measurementUnitCode(measurement.unit);
                if (key && measurementUnit && measurements[key] === undefined) {
                    const value = Number(measurement.measurement_value);
                    if (!Number.isFinite(value) || value <= 0) return;
                    if (firstUnit && firstUnit !== measurementUnit) return;
                    firstUnit = measurementUnit;
                    unit = measurementUnit;
                    measurements[key] = value;
                }
            });
        return { customer_id: customerId, measurements, unit, notes: "" };
    }

    function appendMeasurementSetForm(customerId, measurementSet) {
        const meta = document.createElement("div");
        meta.className = "measurement-meta-grid";
        const customerWrapper = document.createElement("div");
        customerWrapper.className = "dialog-field";
        const customerLabel = document.createElement("label");
        customerLabel.textContent = "Customer";
        customerWrapper.append(customerLabel);
        if (customerId) {
            const customer = customerMap.get(customerId);
            const customerDisplay = document.createElement("span");
            customerDisplay.className = "measurement-customer-name";
            customerDisplay.textContent = customer?.full_name || "Selected customer";
            const hiddenCustomer = document.createElement("input");
            hiddenCustomer.type = "hidden";
            hiddenCustomer.name = "customer_id";
            hiddenCustomer.value = customerId;
            customerWrapper.append(customerDisplay, hiddenCustomer);
        } else {
            const select = document.createElement("select");
            select.id = "record-customer_id";
            select.name = "customer_id";
            select.required = true;
            customerLabel.htmlFor = select.id;
            select.append(makeOption("", "Select customer"));
            customerOptions().forEach((option) => select.append(makeOption(option.value, option.label)));
            if (customerId) select.value = customerId;
            select.addEventListener("change", () => {
                const selectedSet = getMeasurementSet(select.value) || getLegacyMeasurementSet(select.value);
                applyMeasurementSetToForm(selectedSet);
            });
            customerWrapper.append(select);
        }
        const unitWrapper = document.createElement("div");
        unitWrapper.className = "dialog-field";
        const unitLabel = document.createElement("label");
        unitLabel.htmlFor = "record-unit";
        unitLabel.textContent = "Measurement unit";
        const unitSelect = document.createElement("select");
        unitSelect.id = "record-unit";
        unitSelect.name = "unit";
        unitSelect.append(makeOption("cm", "Centimetres (cm)"), makeOption("in", "Inches (in)"));
        unitSelect.value = measurementSet?.unit === "in" ? "in" : "cm";
        unitWrapper.append(unitLabel, unitSelect);
        meta.append(customerWrapper, unitWrapper);
        dialogFields.append(meta);

        MEASUREMENT_SECTIONS.forEach((section) => {
            const sectionElement = document.createElement("section");
            sectionElement.className = "measurement-dialog-section";
            const heading = document.createElement("h3");
            heading.textContent = section.title;
            const grid = document.createElement("div");
            grid.className = "measurement-input-grid";
            section.fields.forEach(([key, labelText]) => {
                const wrapper = document.createElement("div");
                wrapper.className = "dialog-field";
                const label = document.createElement("label");
                label.htmlFor = `record-${key}`;
                label.textContent = labelText;
                const input = document.createElement("input");
                input.id = label.htmlFor;
                input.name = key;
                input.type = "number";
                input.inputMode = "decimal";
                input.min = "0.01";
                input.step = "any";
                input.placeholder = "Optional";
                input.value = measurementSet?.measurements?.[key] ?? "";
                wrapper.append(label, input);
                grid.append(wrapper);
            });
            sectionElement.append(heading, grid);
            dialogFields.append(sectionElement);
        });

        const notesWrapper = document.createElement("div");
        notesWrapper.className = "dialog-field measurement-notes-field";
        const notesLabel = document.createElement("label");
        notesLabel.htmlFor = "record-notes";
        notesLabel.textContent = "Special fitting instructions and custom measurements";
        const notes = document.createElement("textarea");
        notes.id = notesLabel.htmlFor;
        notes.name = "notes";
        notes.rows = 4;
        notes.placeholder = "Add fitting instructions or describe any custom measurements";
        notes.value = measurementSet?.notes || "";
        notesWrapper.append(notesLabel, notes);
        dialogFields.append(notesWrapper);
    }

    function applyMeasurementSetToForm(measurementSet) {
        if (!measurementSet) return;
        const unit = document.querySelector("#record-unit");
        if (unit) unit.value = measurementSet.unit === "in" ? "in" : "cm";
        MEASUREMENT_SECTIONS.forEach((section) => {
            section.fields.forEach(([key]) => {
                const input = document.querySelector(`#record-${key}`);
                if (input) input.value = measurementSet.measurements?.[key] ?? "";
            });
        });
        const notes = document.querySelector("#record-notes");
        if (notes) notes.value = measurementSet.notes || "";
    }

    async function openRecordDialog(operation, recordId, presetCustomerId, presetOrderId) {
        const isMeasurementSetOperation = operation === "edit-measurement-set" ||
            (operation === "add-measurement" && state.measurementSetsAvailable);
        if (operation === "add-measurement" && !state.measurementSetsAvailable) {
            setWorkspaceMessage("The full measurement form requires measurement-sets-schema.sql. You can still add a single legacy measurement until the migration is applied.");
        }
        if (isMeasurementSetOperation && state.customers.length === 0) {
            setWorkspaceMessage("Add a customer before recording measurements.", true);
            showView("customers");
            return;
        }
        if (operation === "add-order" && state.customers.length === 0) {
            setWorkspaceMessage("Add a customer before creating an order.", true);
            showView("customers");
            return;
        }
        const recordType = isMeasurementSetOperation ? "measurement" : operation.split("-").at(-1);
        const source = recordType === "customer" ? state.customers
            : recordType === "measurement" ? state.measurements : state.orders;
        const record = isMeasurementSetOperation
            ? getMeasurementSet(recordId || presetCustomerId || "")
            : recordId ? source.find((item) => item.id === recordId) : null;
        const formCustomerId = isMeasurementSetOperation
            ? record?.customer_id || recordId || presetCustomerId || ""
            : presetCustomerId;
        const measurementSet = isMeasurementSetOperation
            ? record || (formCustomerId ? getLegacyMeasurementSet(formCustomerId) : null)
            : null;
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

        currentOperation = {
            name: isMeasurementSetOperation ? "save-measurement-set" : operation,
            record
        };
        recordForm.reset();
        dialogFields.replaceChildren();
        document.querySelector("#dialog-message").textContent = "";
        document.querySelector("#dialog-title").textContent = isMeasurementSetOperation
            ? "Full customer measurements"
            : operation.endsWith("order")
                ? `${record ? "Edit" : "Add"} clothing item`
            : `${record ? "Edit" : "Add"} ${recordType === "payment" ? "payment" : recordType}`;
        document.querySelector("#dialog-submit").disabled = false;
        document.querySelector("#dialog-submit").hidden = false;

        if (isMeasurementSetOperation) {
            document.querySelector("#record-dialog").classList.add("measurement-dialog");
            dialogFields.classList.add("measurement-dialog-fields");
            appendMeasurementSetForm(formCustomerId, measurementSet);
            dialog.showModal();
            return;
        }
        document.querySelector("#record-dialog").classList.remove("measurement-dialog");
        dialogFields.classList.remove("measurement-dialog-fields");
        fieldsFor(operation, record, presetCustomerId, presetOrderId).forEach((field) => {
            const wrapper = document.createElement("div");
            wrapper.className = "dialog-field";
            if (field.name === "customer_id" && presetCustomerId && operation === "add-order") {
                const label = document.createElement("label");
                label.textContent = "Customer";
                const selectedCustomer = document.createElement("span");
                selectedCustomer.className = "measurement-customer-name";
                selectedCustomer.textContent = customerMap.get(presetCustomerId)?.full_name || "Selected customer";
                const hiddenCustomerId = document.createElement("input");
                hiddenCustomerId.type = "hidden";
                hiddenCustomerId.name = "customer_id";
                hiddenCustomerId.value = presetCustomerId;
                wrapper.append(label, selectedCustomer, hiddenCustomerId);
                dialogFields.append(wrapper);
                return;
            }
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
        if (operation.endsWith("order")) {
            appendOrderMeasurementFields(record);
            appendOrderBalancePreview(record);
        }
        dialog.showModal();
    }

    function appendPaymentBalancePreview() {
        const orderInput = recordForm.elements.order_id;
        const amountInput = recordForm.elements.amount;
        const summary = document.createElement("p");
        summary.className = "inline-notice order-balance-preview";
        summary.setAttribute("aria-live", "polite");
        const update = () => {
            const order = orderMap.get(orderInput?.value);
            const amount = Number(amountInput?.value || 0);
            const remaining = order ? balance(order) - amount : 0;
            summary.textContent = !order ? "Choose an order to see its balance."
                : amount <= 0 ? `Balance before payment ${formatMoney(balance(order))}. Enter an amount.`
                    : remaining >= 0 ? `Balance after payment ${formatMoney(remaining)}.`
                        : "Payment exceeds the outstanding balance.";
            summary.style.color = order && amount > balance(order) ? "#a2372b" : "";
        };
        orderInput?.addEventListener("change", update);
        amountInput?.addEventListener("input", update);
        update();
        dialogFields.append(summary);
    }

    function appendOrderBalancePreview(record) {
        const totalInput = recordForm.elements.total_amount;
        const paid = Number(record?.amount_paid || 0);
        const summary = document.createElement("p");
        summary.className = "inline-notice order-balance-preview";
        summary.setAttribute("aria-live", "polite");
        const update = () => {
            const total = Number(totalInput?.value || 0);
            const balanceDue = total - paid;
            summary.textContent = total > 0 && balanceDue >= 0
                ? `Amount paid ${formatMoney(paid)} · Balance ${formatMoney(balanceDue)}`
                : total > 0 ? "Amount paid cannot exceed the total price." : "Enter a total price to see the balance.";
            summary.style.color = total > 0 && balanceDue < 0 ? "#a2372b" : "";
        };
        totalInput?.addEventListener("input", update);
        update();
        dialogFields.append(summary);
    }

    function appendOrderMeasurementFields(record) {
        const section = document.createElement("section");
        section.className = "measurement-dialog-section garment-measurements";
        const heading = document.createElement("h3");
        heading.textContent = "Garment measurements";
        section.append(heading);
        const hint = document.createElement("p");
        hint.className = "upload-help";
        hint.textContent = state.garmentMeasurementsAvailable
            ? "Enter only the measurements needed for this item. Leave the rest blank."
            : "Review garment-measurements-migration.sql to enable measurements saved with each item.";
        section.append(hint);
        const unitLabel = document.createElement("label");
        unitLabel.htmlFor = "record-garment-measurement-unit";
        unitLabel.textContent = "Measurement unit";
        const unit = document.createElement("select");
        unit.id = unitLabel.htmlFor;
        unit.name = "garment_measurement_unit";
        unit.append(makeOption("cm", "Centimetres (cm)"), makeOption("in", "Inches (in)"));
        unit.value = record?.measurement_data?.unit === "in" ? "in" : "cm";
        unit.disabled = !state.garmentMeasurementsAvailable;
        section.append(unitLabel, unit);
        MEASUREMENT_SECTIONS.forEach((group) => {
            const subheading = document.createElement("h4");
            subheading.textContent = group.title;
            section.append(subheading);
            const grid = document.createElement("div");
            grid.className = "measurement-input-grid";
            group.fields.forEach(([key, labelText]) => {
                const wrapper = document.createElement("div");
                wrapper.className = "dialog-field";
                const label = document.createElement("label");
                label.htmlFor = `record-garment-${key}`;
                label.textContent = labelText;
                const input = document.createElement("input");
                input.id = label.htmlFor;
                input.name = `garment_measurement_${key}`;
                input.type = "number";
                input.inputMode = "decimal";
                input.min = "0.01";
                input.step = "any";
                input.placeholder = "Optional";
                input.value = record?.measurement_data?.values?.[key] ?? "";
                input.disabled = !state.garmentMeasurementsAvailable;
                wrapper.append(label, input);
                grid.append(wrapper);
            });
            section.append(grid);
        });
        dialogFields.append(section);
    }

    async function showOrderDetails(order) {
        if (!order) return;
        document.querySelector("#record-dialog").classList.remove("measurement-dialog");
        dialogFields.classList.remove("measurement-dialog-fields");
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
            if (operation === "save-measurement-set") {
                if (!values.customer_id || !customerMap.has(values.customer_id)) {
                    throw new Error("Choose a customer before saving measurements.");
                }
                const measurements = {};
                for (const section of MEASUREMENT_SECTIONS) {
                    for (const [key, label] of section.fields) {
                        const value = String(values[key] || "").trim();
                        if (!value) continue;
                        const numericValue = Number(value);
                        if (!Number.isFinite(numericValue) || numericValue <= 0) {
                            throw new Error(`${label} must be a positive number or left blank.`);
                        }
                        measurements[key] = numericValue;
                    }
                }
                const { data, error } = await supabaseClient.from("customer_measurement_sets")
                    .upsert({
                        customer_id: values.customer_id,
                        tailor_id: state.user.id,
                        measurements,
                        unit: values.unit === "in" ? "in" : "cm",
                        notes: String(values.notes || "").trim() || null,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "customer_id" })
                    .select("customer_id")
                    .single();
                if (error) throw error;
                if (!data) throw new Error("No measurement set was saved. Check that you can access this customer.");
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
                    payload = { customer_id: values.customer_id, measurement_name: values.measurement_name.trim(), measurement_value: value, unit: measurementUnitCode(values.unit) || "cm" };
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
                    const garmentMeasurements = {};
                    for (const section of MEASUREMENT_SECTIONS) {
                        for (const [key, label] of section.fields) {
                            const raw = String(values[`garment_measurement_${key}`] || "").trim();
                            if (!raw) continue;
                            const value = Number(raw);
                            if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number or left blank.`);
                            garmentMeasurements[key] = value;
                        }
                    }
                    if (Object.keys(garmentMeasurements).length && !state.garmentMeasurementsAvailable) {
                        throw new Error("Garment measurements need the reviewed garment-measurements-migration.sql schema change before they can be saved.");
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
                            ...(state.garmentMeasurementsAvailable ? {
                                measurement_data: Object.keys(garmentMeasurements).length
                                    ? { unit: values.garment_measurement_unit === "in" ? "in" : "cm", values: garmentMeasurements }
                                    : null
                            } : {}),
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
            window.sessionStorage.setItem(selectedCustomerStorageKey, id);
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
                window.sessionStorage.removeItem(selectedCustomerStorageKey);
                document.querySelector("#customer-profile").hidden = true;
            }
            await loadWorkspace();
            setWorkspaceMessage(deleteWarning || "Deleted successfully.", Boolean(deleteWarning));
        } catch (error) {
            setWorkspaceMessage(error.message || "Unable to delete this record.", true);
            button.disabled = false;
        }

    }

    showView(window.location.hash.slice(1) || "customers");
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
