import {
    firebaseApp,
    db,
    storage
} from "./firebase-config.js";

import {
    getCountry,
    resolveCountry,
    resolveSubdivision,
    populateCountrySelect,
    populateSubdivisionSelect
} from "./location-data.js";

import {
    canDownloadMembershipApplicationPdf,
    generateMembershipApplicationPdf
} from "./application-pdf.js";

import { generateMemberHistoryPdf } from "./member-history-pdf.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    doc,
    setDoc,
    updateDoc,
    getDoc,
    collection,
    getDocs,
    deleteField,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";


const auth = getAuth(firebaseApp);

const loadAdminMemberAccounts = async () => {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map((memberSnapshot) => ({
        ...memberSnapshot.data(),
        uid: memberSnapshot.id
    }));
};

const loadAdminApplications = async () => {
    const snapshot = await getDocs(collection(db, "membershipApplications"));
    return snapshot.docs.map((applicationSnapshot) => ({
        ...applicationSnapshot.data(),
        applicantUid: applicationSnapshot.id
    }));
};

const createMemberHistoryRef = (memberUid) =>
    doc(collection(db, "memberHistory", memberUid, "entries"));

const buildMemberHistoryEntry = ({
    memberUid,
    action,
    category,
    performedBy,
    field = null,
    oldValue = null,
    newValue = null,
    source,
    note = null
}) => ({
    memberUid,
    action,
    category,
    performedAt: serverTimestamp(),
    performedBy,
    field,
    oldValue,
    newValue,
    source,
    note
});


const sendVerificationEmail =
    async (user, source) => {

        console.log(
            `[Email verification] Send beginning (${source}).`
        );


        try {

            await sendEmailVerification(user);


            console.log(
                `[Email verification] Send resolved successfully (${source}).`
            );

        } catch (error) {

            console.error(
                `[Email verification] Send failed (${source}).`,
                error
            );

            throw error;

        }

    };


const DOG_SPORT_OPTIONS = [
    { id: "scent-work", label: "Scent Work / Nose Work" },
    { id: "igp", label: "IGP" },
    { id: "french-ring", label: "French Ring" },
    { id: "mondioring", label: "Mondioring" },
    { id: "psa", label: "PSA" },
    { id: "herding", label: "Herding" },
    { id: "search-and-rescue", label: "Search & Rescue" },
    { id: "tracking", label: "Tracking" },
    { id: "mantrailing", label: "Mantrailing" },
    { id: "joring-canicross", label: "Joring / Canicross" },
    { id: "obedience", label: "Obedience" },
    { id: "rally", label: "Rally" },
    { id: "agility", label: "Agility" },
    { id: "dock-diving", label: "Dock Diving" },
    { id: "fast-cat-lure-coursing", label: "Fast CAT / Lure Coursing" },
    { id: "barn-hunt", label: "Barn Hunt" },
    { id: "disc-dog", label: "Disc Dog" },
    { id: "flyball", label: "Flyball" },
    { id: "weight-pull", label: "Weight Pull" },
    { id: "conformation", label: "Conformation" },
    { id: "service-dog-training", label: "Service Dog Training" },
    { id: "trick-dog", label: "Trick Dog" },
    { id: "farm-stock-work", label: "Farm / Stock Work" },
    { id: "hunting-field-work", label: "Hunting / Field Work" }
];

const DOG_SPORT_IDS =
    new Set(
        DOG_SPORT_OPTIONS.map(
            (option) => option.id
        )
    );

const DOG_SPORT_LABELS =
    new Map(
        DOG_SPORT_OPTIONS.map(
            (option) => [
                option.id,
                option.label
            ]
        )
    );

const APPLICATION_QUESTION_TYPES = new Set([
    "shortText",
    "longText",
    "yesNo",
    "singleSelect",
    "multiSelect"
]);

// Question IDs are permanent once used by a submitted application. Future
// configuration should deactivate questions instead of deleting or renaming IDs.
const FALLBACK_MEMBERSHIP_APPLICATION_QUESTIONS = [
    {
        id: "animal-organizations",
        label: "Please list any other animal organizations you have been, or are currently, a member of.",
        type: "longText",
        required: false,
        active: true,
        order: 10
    },
    {
        id: "discipline-history",
        label: "Have you previously been disciplined by a dog club, breed organization, or governing body?",
        type: "yesNo",
        required: true,
        active: true,
        order: 20,
        requiresExplanationWhen: true,
        explanationLabel: "Please explain."
    },
    {
        id: "owns-beauceron",
        label: "Do you currently own a Beauceron?",
        type: "yesNo",
        required: true,
        active: true,
        order: 30
    },
    {
        id: "dog-sports",
        label: "What dog sports, training, or activities do you currently participate in?",
        type: "multiSelect",
        optionSource: "DOG_SPORT_OPTIONS",
        required: false,
        active: true,
        order: 40
    }
];

const normalizeApplicationQuestions = (questions) => {
    const source = Array.isArray(questions)
        ? questions
        : FALLBACK_MEMBERSHIP_APPLICATION_QUESTIONS;
    const normalized = source.filter((question) =>
        question &&
        typeof question.id === "string" && question.id.trim() &&
        typeof question.label === "string" && question.label.trim() &&
        APPLICATION_QUESTION_TYPES.has(question.type) &&
        typeof question.required === "boolean" &&
        typeof question.active === "boolean" &&
        typeof question.order === "number"
    ).map((question) => ({
        ...question,
        id: question.id.trim(),
        label: question.label.trim(),
        options: Array.isArray(question.options)
            ? question.options.filter((option) =>
                option && typeof option.id === "string" &&
                typeof option.label === "string"
            )
            : [],
        requiresExplanationWhen: question.requiresExplanationWhen === true,
        explanationLabel: typeof question.explanationLabel === "string" && question.explanationLabel.trim()
            ? question.explanationLabel.trim()
            : "Please explain."
    }));
    return Array.isArray(questions)
        ? normalized.sort((left, right) => left.order - right.order)
        : FALLBACK_MEMBERSHIP_APPLICATION_QUESTIONS.map((question) => ({ ...question }));
};

const getApplicationQuestionOptions = (question) =>
    question.optionSource === "DOG_SPORT_OPTIONS"
        ? DOG_SPORT_OPTIONS
        : question.options || [];

const renderConfigurableApplicationQuestions = (container, questions, namePrefix = "custom-question") => {
    container.replaceChildren();
    questions.filter((question) => question.active).sort((left, right) => left.order - right.order)
        .forEach((question) => {
            const wrapper = document.createElement("div");
            wrapper.className = "application-custom-question";
            wrapper.dataset.questionId = question.id;
            wrapper.dataset.questionType = question.type;
            const labelText = document.createTextNode(question.label);
            const requiredMarker = document.createElement("span");
            requiredMarker.setAttribute("aria-hidden", "true");
            requiredMarker.textContent = question.required ? " *" : "";
            const appendChoice = (parent, option, inputType) => {
                const label = document.createElement("label");
                label.className = "checkbox-option";
                const input = document.createElement("input");
                input.type = inputType;
                input.name = `${namePrefix}-${question.id}`;
                input.value = option.id;
                const optionLabel = document.createElement("span");
                optionLabel.textContent = option.label;
                label.append(input, optionLabel);
                parent.appendChild(label);
            };

            if (["shortText", "longText"].includes(question.type)) {
                const label = document.createElement("label");
                const control = document.createElement(question.type === "longText" ? "textarea" : "input");
                if (question.type === "shortText") control.type = "text";
                if (question.type === "longText") control.rows = 6;
                label.append(labelText, requiredMarker, control);
                wrapper.appendChild(label);
            } else {
                const fieldset = document.createElement("fieldset");
                fieldset.className = "application-fieldset";
                const legend = document.createElement("legend");
                legend.append(labelText, requiredMarker);
                fieldset.appendChild(legend);
                if (question.type === "yesNo") {
                    appendChoice(fieldset, {id: "yes", label: "Yes"}, "radio");
                    appendChoice(fieldset, {id: "no", label: "No"}, "radio");
                } else if (question.type === "singleSelect") {
                    getApplicationQuestionOptions(question).forEach((option) => appendChoice(fieldset, option, "radio"));
                } else {
                    const grid = document.createElement("div");
                    grid.className = "checkbox-grid";
                    getApplicationQuestionOptions(question).forEach((option) => appendChoice(grid, option, "checkbox"));
                    fieldset.appendChild(grid);
                }
                wrapper.appendChild(fieldset);
                if (question.type === "yesNo" && question.requiresExplanationWhen) {
                    const explanationField = document.createElement("div");
                    explanationField.className = "form-field custom-question-explanation";
                    explanationField.hidden = true;
                    const explanationLabel = document.createElement("label");
                    explanationLabel.textContent = question.explanationLabel || "Please explain.";
                    const explanation = document.createElement("textarea");
                    explanation.rows = 5;
                    explanation.dataset.questionExplanation = "true";
                    explanationLabel.appendChild(explanation);
                    explanationField.appendChild(explanationLabel);
                    wrapper.appendChild(explanationField);
                    wrapper.querySelectorAll('input[type="radio"]').forEach((radio) => {
                        radio.addEventListener("change", () => {
                            explanationField.hidden = wrapper.querySelector("input:checked")?.value !== "yes";
                        });
                    });
                }
            }
            container.appendChild(wrapper);
        });
};

const loadMembershipApplicationConfiguration = async () => {
    try {
        const currentSnapshot = await getDoc(doc(db, "membershipApplicationConfig", "current"));
        if (!currentSnapshot.exists()) {
            return {
                questions: normalizeApplicationQuestions(),
                version: 0,
                usingDefaults: true,
                configSource: "centralized-fallback"
            };
        }
        const currentData = currentSnapshot.data();
        if (Number.isInteger(currentData.currentVersion) && currentData.currentVersion > 0) {
            const versionSnapshot = await getDoc(doc(
                db,
                "membershipApplicationConfig",
                "current",
                "versions",
                String(currentData.currentVersion)
            ));
            if (versionSnapshot.exists()) {
                return {
                    questions: normalizeApplicationQuestions(versionSnapshot.data().questions),
                    version: currentData.currentVersion,
                    usingDefaults: false,
                    configSource: "current-live-version"
                };
            }
        }
        if (Array.isArray(currentData.questions)) {
            return {
                questions: normalizeApplicationQuestions(currentData.questions),
                version: 1,
                usingDefaults: false,
                legacy: true,
                configSource: "legacy-config"
            };
        }
        return {
            questions: normalizeApplicationQuestions(),
            version: 0,
            usingDefaults: true,
            configSource: "centralized-fallback"
        };
    } catch (error) {
        console.warn(
            "Membership application question configuration could not be loaded; using fallback questions.",
            error
        );
        return {
            questions: normalizeApplicationQuestions(),
            version: 0,
            usingDefaults: true,
            configSource: "centralized-fallback"
        };
    }
};

const hasValidApplicationQuestionResponseShape = (response) => {
    if (!response || typeof response.questionId !== "string" ||
        typeof response.questionLabel !== "string" ||
        !APPLICATION_QUESTION_TYPES.has(response.questionType) ||
        typeof response.required !== "boolean") {
        return false;
    }
    if (["shortText", "longText", "singleSelect"].includes(response.questionType)) {
        return typeof response.answer === "string";
    }
    if (response.questionType === "yesNo") {
        return (response.answer === null || typeof response.answer === "boolean") &&
            (response.explanation === undefined || typeof response.explanation === "string");
    }
    return Array.isArray(response.answer) && response.answer.every(
        (answer) => typeof answer === "string"
    );
};

const getApplicationQuestionResponses = (applicationData) => {
    if (Array.isArray(applicationData?.customQuestionResponses)) {
        const responses = applicationData.customQuestionResponses.filter(
            hasValidApplicationQuestionResponseShape
        );
        if (!responses.some((response) => response.questionId === "discipline-history") &&
            typeof applicationData.disciplineHistory === "boolean") {
            const disciplineQuestion = FALLBACK_MEMBERSHIP_APPLICATION_QUESTIONS.find(
                (question) => question.id === "discipline-history"
            );
            responses.push({
                questionId: disciplineQuestion.id,
                questionLabel: disciplineQuestion.label,
                questionType: disciplineQuestion.type,
                required: disciplineQuestion.required,
                answer: applicationData.disciplineHistory,
                requiresExplanationWhen: true,
                explanationLabel: disciplineQuestion.explanationLabel,
                explanation: applicationData.disciplineExplanation || ""
            });
        }
        return responses;
    }
    if (!applicationData) return [];
    return FALLBACK_MEMBERSHIP_APPLICATION_QUESTIONS.map((question) => {
        const legacyAnswer = question.id === "animal-organizations"
            ? applicationData.animalOrganizations ?? ""
            : question.id === "discipline-history"
                ? applicationData.disciplineHistory ?? null
                : question.id === "owns-beauceron"
                    ? applicationData.ownsBeauceron ?? null
                    : Array.isArray(applicationData.dogSports) ? applicationData.dogSports : [];
        const response = {
            questionId: question.id,
            questionLabel: question.label,
            questionType: question.type,
            required: question.required,
            answer: legacyAnswer
        };
        if (question.id === "discipline-history") {
            response.requiresExplanationWhen = true;
            response.explanationLabel = question.explanationLabel;
            response.explanation = applicationData.disciplineExplanation || "";
        }
        return response;
    });
};

const formatApplicationQuestionAnswer = (response) => {
    if (response.questionType === "yesNo") {
        const answer = response.answer === true ? "Yes" : response.answer === false ? "No" : "—";
        return response.answer === true && response.explanation
            ? `${answer}\n${response.explanationLabel || "Explanation"}: ${response.explanation}`
            : answer;
    }
    if (Array.isArray(response.answer)) {
        const values = response.questionId === "dog-sports"
            ? response.answer.map((id) => DOG_SPORT_LABELS.get(id) || id)
            : response.answer;
        return values.length ? values.join(", ") : "None selected";
    }
    return typeof response.answer === "string" && response.answer.trim()
        ? response.answer
        : "—";
};

const hasValidRequiredQuestionAnswer = (response) => {
    if (!response.required) return true;
    if (response.questionType === "yesNo") return typeof response.answer === "boolean";
    if (response.questionType === "multiSelect") {
        return Array.isArray(response.answer) && response.answer.length > 0;
    }
    return typeof response.answer === "string" && response.answer.trim().length > 0;
};

const MEMBERSHIP_STATUSES = [
    "Active",
    "Renewals Pending",
    "Past Due",
    "Archived",
    "Pending Application",
    "Pending Dues",
    "Suspended",
    "Expelled"
];

const MEMBERSHIP_TYPES = [
    "Individual",
    "Joint",
    "Junior",
    "Foreign"
];

const DUES_ATTENTION_STATUSES =
    new Set(["Pending Dues", "Past Due"]);

const FALLBACK_MEMBERSHIP_CONFIG = {
    Individual: {
        active: true,
        annualDues: 35,
        displayName: "Individual Membership",
        description: "Standard WBA membership for one adult member."
    },
    Joint: {
        active: true,
        annualDues: 65,
        displayName: "Joint Membership",
        description: "Membership for two linked members sharing the same household/address."
    },
    Junior: {
        active: true,
        annualDues: null,
        displayName: "Junior Membership",
        description: "For junior applicants who are between 10 and 18 years old on January 1 of the membership year."
    },
    Foreign: {
        active: true,
        annualDues: 35,
        displayName: "Foreign Membership",
        description: "For applicants whose primary residence is outside the United States and Canada."
    }
};


const normalizeMembershipConfig = (configuredTypes = {}) => {
    const normalized = {};
    MEMBERSHIP_TYPES.forEach((membershipType) => {
        const fallback = FALLBACK_MEMBERSHIP_CONFIG[membershipType];
        const configured = configuredTypes?.[membershipType];
        normalized[membershipType] = {
            active: typeof configured?.active === "boolean" ? configured.active : fallback.active,
            annualDues: typeof configured?.annualDues === "number" || configured?.annualDues === null
                ? configured.annualDues
                : fallback.annualDues,
            displayName: configured?.displayName || fallback.displayName,
            description: configured?.description || fallback.description
        };
    });
    return normalized;
};


const loadMembershipConfig = async () => {
    try {
        const snapshot = await getDoc(doc(db, "membershipConfig", "current"));
        return snapshot.exists()
            ? normalizeMembershipConfig(snapshot.data().membershipTypes)
            : normalizeMembershipConfig();
    } catch (error) {
        console.error("Membership configuration could not be loaded; using fallback configuration.", error);
        return normalizeMembershipConfig();
    }
};


const getAgeOnJanuaryFirst = (dateOfBirth, membershipYear) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || "")) return null;
    const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
    return membershipYear - birthYear - (birthMonth > 1 || birthDay > 1 ? 1 : 0);
};


const isJuniorEligible = (dateOfBirth, membershipYear) => {
    const age = getAgeOnJanuaryFirst(dateOfBirth, membershipYear);
    return age !== null && age >= 10 && age <= 18;
};


const validateMembershipTypeEligibility = (applicationData, membershipYear) => {
    if (applicationData.membershipType === "Junior") {
        if (!applicationData.dateOfBirth) {
            return "Date of Birth is required for Junior Membership.";
        }
        if (!isJuniorEligible(applicationData.dateOfBirth, membershipYear)) {
            return `Junior applicants must be between 10 and 18 years old on January 1, ${membershipYear}.`;
        }
    }

    const isForeignResidence = !["US", "CA"].includes(applicationData.countryCode);
    if (isForeignResidence && ["Individual", "Joint"].includes(applicationData.membershipType)) {
        return "Applicants residing outside the United States and Canada must select Foreign Membership.";
    }
    if (!isForeignResidence && applicationData.membershipType === "Foreign") {
        return "Foreign Membership is for applicants residing outside the United States and Canada.";
    }
    return "";
};


const getAdminAuthorization = async (authenticatedUser) => {
    if (!authenticatedUser) return {active: false, moderator: false, role: "member", superAdmin: false};
    const snapshot = await getDoc(doc(db, "adminUsers", authenticatedUser.uid));
    const data = snapshot.exists() ? snapshot.data() : {};
    const superAdmin = data.active === true && data.superAdmin === true;
    const trustedRole = data.role === "moderator"
        ? "moderator"
        : data.role === "admin" || (data.active === true && !data.role)
            ? "admin"
            : "member";
    return {
        active: data.active === true && (superAdmin || trustedRole === "admin"),
        moderator: data.active === true && trustedRole === "moderator",
        role: superAdmin ? "superAdmin" : trustedRole,
        superAdmin
    };
};


const getCurrentPage = () =>
    window.location.pathname.split("/").pop() || "index.html";


const logRoutingDecision = ({
    authenticatedUser,
    authorization,
    memberRecordExists,
    decision,
    reason
}) => {
    console.log("[Routing]", {
        page: getCurrentPage(),
        uid: authenticatedUser?.uid || null,
        verified: authenticatedUser?.emailVerified === true,
        admin: authorization?.active === true,
        superAdmin: authorization?.superAdmin === true,
        memberRecordExists: memberRecordExists === true,
        decision,
        reason
    });
};


const redirectToPage = (destination, reason, routingState = {}) => {
    const currentPage = getCurrentPage();
    const destinationPage = destination.split("?")[0];
    logRoutingDecision({
        ...routingState,
        decision: currentPage === destinationPage ? "stay-current-page" : `redirect:${destination}`,
        reason
    });
    if (currentPage === destinationPage) return false;
    window.location.replace(destination);
    return true;
};


const isAuthorizedAdmin =
    async (authenticatedUser) => {

        if (!authenticatedUser) {
            return false;
        }


        const authorization = await getAdminAuthorization(authenticatedUser);
        return authorization?.active === true;

    };


const CURRENT_MEMBER_STATUSES =
    new Set(["Active", "Renewals Pending"]);

const STATUS_PAGE_MEMBERSHIP_STATUSES =
    new Set([
        "Pending Application",
        "Pending Dues",
        "Past Due",
        "Archived",
        "Inactive",
        "Expired",
        "Lapsed",
        "Resigned",
        "Suspended",
        "Expelled"
    ]);

    const STATUS_PAGE_APPLICATION_STATUSES =
    new Set([
        "Submitted",
        "Awaiting Board Decision",
        "Approved",
        "Declined",
        "Withdrawn",
        "Needs Revision"
    ]);


const getPostLoginRoute =
    async (authenticatedUser, { allowRevisionEditing = false } = {}) => {

        if (!authenticatedUser?.emailVerified) {
            logRoutingDecision({
                authenticatedUser,
                authorization: {active: false, superAdmin: false},
                memberRecordExists: false,
                decision: "membership-application.html",
                reason: "email-unverified"
            });
            return {
                destination: "membership-application.html",
                userData: {},
                applicationData: null,
                authorization: {active: false, superAdmin: false},
                memberRecordExists: false
            };
        }

        const authorization = await getAdminAuthorization(authenticatedUser);
        if (authorization?.active === true && authorization?.superAdmin === true) {
            let memberRecordExists = false;
            try {
                memberRecordExists = (
                    await getDoc(doc(db, "users", authenticatedUser.uid))
                ).exists();
            } catch (error) {
                console.warn("[Routing] Super Admin member-record diagnostic read failed.", error);
            }
            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists,
                decision: "admin.html",
                reason: "active-super-admin-priority"
            });
            return {
                destination: "admin.html",
                userData: {},
                applicationData: null,
                authorization,
                memberRecordExists
            };
        }


        const [userSnapshot, applicationSnapshot] =
            await Promise.all([
                getDoc(doc(db, "users", authenticatedUser.uid)),
                getDoc(doc(db, "membershipApplications", authenticatedUser.uid))
            ]);

        const userData =
            userSnapshot.exists() ? userSnapshot.data() : {};

        const applicationData =
            applicationSnapshot.exists() ? applicationSnapshot.data() : null;

        const membershipStatus = userData.membershipStatus || "";
        const applicationStatus = applicationData?.applicationStatus || "";

        const returnRoute = (destination, reason) => {
            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists: userSnapshot.exists(),
                decision: destination,
                reason
            });
            return {
                destination,
                userData,
                applicationData,
                authorization,
                memberRecordExists: userSnapshot.exists()
            };
        };


        if (CURRENT_MEMBER_STATUSES.has(membershipStatus)) {
            return returnRoute("dashboard.html", "current-member");
        }

        if (applicationStatus === "Needs Revision") {
            return returnRoute(
                allowRevisionEditing
                    ? "membership-application.html"
                    : "membership-status.html",
                allowRevisionEditing
                    ? "application-revision-editing"
                    : "application-needs-revision"
            );
        }

        if (
            STATUS_PAGE_MEMBERSHIP_STATUSES.has(membershipStatus) ||
            STATUS_PAGE_APPLICATION_STATUSES.has(applicationStatus)
        ) {
            return returnRoute("membership-status.html", "membership-or-application-status");
        }

        if (membershipStatus && membershipStatus !== "No Membership") {
            return returnRoute("membership-status.html", "nonstandard-membership-status");
        }

        if (!applicationData || applicationStatus === "Draft") {
            return returnRoute("membership-application.html", "application-not-started-or-draft");
        }

        return returnRoute("membership-status.html", "application-progress");

    };


const routeAuthenticatedUser =
    async (authenticatedUser) => {

        const route =
            await getPostLoginRoute(authenticatedUser);

        redirectToPage(route.destination, "post-login-route", {
            authenticatedUser,
            authorization: route.authorization,
            memberRecordExists: route.memberRecordExists
        });

    };


// ------------------------------------
// Landing Page
// ------------------------------------

const loginButton =
    document.getElementById("loginButton");

const createAccountButton =
    document.getElementById("createAccountButton");


if (loginButton) {

    loginButton.addEventListener("click", () => {

        window.location.href = "login.html";

    });

}


if (createAccountButton) {

    createAccountButton.addEventListener("click", () => {

        window.location.href = "create-account.html";

    });

}


// ------------------------------------
// Create Account
// ------------------------------------

const createAccountForm =
    document.getElementById("createAccountForm");


if (createAccountForm) {

    const message =
        document.getElementById("message");


    createAccountForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value;

            const confirmPassword =
                document.getElementById("confirmPassword").value;


            message.textContent = "";


            if (password !== confirmPassword) {

                message.textContent =
                    "The passwords do not match.";

                return;
            }


            let userCredential;


            try {

                userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                console.log(
                    "[Account creation] Firebase Authentication account created successfully."
                );

            } catch (error) {

                console.error(
                    "[Account creation] Firebase Authentication account creation failed.",
                    error
                );


                message.textContent =
                    "We couldn't create your account. Please check your information and try again.";

                return;

            }


            try {


                await sendVerificationEmail(
                    userCredential.user,
                    "initial account creation"
                );

                window.location.href =
                    "membership-application.html?verification=sent";


            } catch (error) {

                window.location.href =
                    "membership-application.html?verification=failed";

            }

        }
    );

}


// ------------------------------------
// Membership Application Onboarding
// ------------------------------------

const membershipApplicationPage =
    document.getElementById(
        "membershipApplicationPage"
    );


if (membershipApplicationPage) {

    const applicationVerificationHeading =
        document.getElementById(
            "applicationVerificationHeading"
        );

    const applicationVerificationMessage =
        document.getElementById(
            "applicationVerificationMessage"
        );

    const applicationResendButton =
        document.getElementById(
            "applicationResendVerificationButton"
        );

    const applicationRefreshButton =
        document.getElementById(
            "applicationRefreshVerificationButton"
        );

    const membershipApplicationForm =
        document.getElementById(
            "membershipApplicationForm"
        );

    const applicationFormMessage =
        document.getElementById(
            "applicationFormMessage"
        );

    const saveApplicationDraftButton =
        document.getElementById(
            "saveApplicationDraftButton"
        );

    const applicationMembershipType =
        document.getElementById(
            "applicationMembershipType"
        );

    const applicationCountrySelect =
        document.getElementById("applicationCountry");

    const applicationSubdivisionSelect =
        document.getElementById("applicationState");

    const sponsorSearchInput =
        document.getElementById(
            "sponsorSearchInput"
        );

    const sponsorSearchResults =
        document.getElementById(
            "sponsorSearchResults"
        );

    let currentApplication = null;
    let sponsorProfiles = [];
    let selectedSponsorUserId = "";
    let selectedSponsorDisplayName = "";
    let sponsorRequested = false;
    let applicationUser = null;
    let unmappedApplicationCountry = "";
    let unmappedApplicationSubdivision = "";
    let membershipConfig = normalizeMembershipConfig();
    let applicationQuestions = normalizeApplicationQuestions();
    let currentApplicationVersion = 0;
    const applicableMembershipYear = new Date().getFullYear();
    const getDraftMembershipYear = () =>
        currentApplication?.membershipYear || applicableMembershipYear;

    let verificationState =
        new URLSearchParams(
            window.location.search
        ).get("verification");


    populateCountrySelect(applicationCountrySelect);
    populateSubdivisionSelect(applicationSubdivisionSelect, "");

    applicationCountrySelect.addEventListener("change", () => {
        unmappedApplicationCountry = "";
        unmappedApplicationSubdivision = "";
        populateSubdivisionSelect(
            applicationSubdivisionSelect,
            applicationCountrySelect.value
        );
        updateMembershipEligibilityMessage();
    });


    const applicationCustomQuestions =
        document.getElementById("applicationCustomQuestions");

    const renderApplicationQuestions = () =>
        renderConfigurableApplicationQuestions(applicationCustomQuestions, applicationQuestions);


    const applicationFieldIds = {
        firstName: "applicationFirstName",
        lastName: "applicationLastName",
        preferredName: "applicationPreferredName",
        email: "applicationEmail",
        phone: "applicationPhone",
        dateOfBirth: "applicationDateOfBirth",
        address: "applicationAddress",
        city: "applicationCity",
        zip: "applicationZip",
        membershipType: "applicationMembershipType"
    };


    const formatAnnualDues = (annualDues) =>
        typeof annualDues === "number"
            ? `$${annualDues.toLocaleString("en-US")}/year`
            : "";


    const updateMembershipEligibilityMessage = () => {
        const message = document.getElementById("membershipEligibilityMessage");
        const membershipType = applicationMembershipType.value;
        const countryCode = applicationCountrySelect.value;
        const dateOfBirth = document.getElementById("applicationDateOfBirth").value;

        if (membershipType === "Junior") {
            const membershipYear = getDraftMembershipYear();
            const age = getAgeOnJanuaryFirst(dateOfBirth, membershipYear);
            message.textContent = age === null
                ? `Enter Date of Birth to confirm Junior eligibility for ${membershipYear}.`
                : isJuniorEligible(dateOfBirth, membershipYear)
                    ? `Eligible for Junior Membership: age ${age} on January 1, ${membershipYear}.`
                    : `Not eligible for Junior Membership: applicants must be age 10–18 on January 1, ${membershipYear}.`;
            return;
        }

        if (countryCode && !["US", "CA"].includes(countryCode)) {
            message.textContent = membershipType === "Foreign"
                ? "Foreign Membership matches the selected country of residence."
                : "Applicants outside the United States and Canada should select Foreign Membership.";
            return;
        }

        if (["US", "CA"].includes(countryCode) && membershipType === "Foreign") {
            message.textContent = "Foreign Membership is for applicants residing outside the United States and Canada.";
            return;
        }

        message.textContent = "";
    };


    const renderMembershipTypeCards = (selectedType = applicationMembershipType.value) => {
        const cards = document.getElementById("membershipTypeCards");
        cards.replaceChildren();

        MEMBERSHIP_TYPES.forEach((membershipType) => {
            const configuration = membershipConfig[membershipType];
            if (!configuration?.active) return;

            const label = document.createElement("label");
            label.className = "membership-type-card";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "membershipTypeChoice";
            radio.value = membershipType;
            radio.checked = membershipType === selectedType;

            const content = document.createElement("span");
            const heading = document.createElement("strong");
            heading.textContent = configuration.displayName;
            content.appendChild(heading);

            const dues = formatAnnualDues(configuration.annualDues);
            if (dues) {
                const duesElement = document.createElement("span");
                duesElement.className = "membership-type-price";
                duesElement.textContent = dues;
                content.appendChild(duesElement);
            }

            const description = document.createElement("span");
            description.textContent = configuration.description;
            content.appendChild(description);
            label.append(radio, content);
            cards.appendChild(label);

            radio.addEventListener("change", () => {
                applicationMembershipType.value = membershipType;
                document.getElementById("membershipTypeNote").hidden =
                    !["Joint", "Junior"].includes(membershipType);
                updateMembershipEligibilityMessage();
            });
        });

        applicationMembershipType.value =
            membershipConfig[selectedType]?.active ? selectedType : "";
        updateMembershipEligibilityMessage();
    };


    document.getElementById("applicationDateOfBirth").addEventListener(
        "change",
        updateMembershipEligibilityMessage
    );


    const renderSelectedSponsor = () => {
        const selectedSponsor = document.getElementById("selectedSponsor");
        selectedSponsor.hidden = !selectedSponsorUserId && !sponsorRequested;
        document.getElementById("selectedSponsorLabel").textContent =
            sponsorRequested ? "Sponsor" : "Selected Sponsor";
        document.getElementById("selectedSponsorName").textContent =
            sponsorRequested ? "Sponsor Request Pending" : selectedSponsorDisplayName;
        document.getElementById("sponsorRequested").checked = sponsorRequested;
    };


    const isActiveSponsorProfile = (profile) =>
        profile?.sponsorEligible === true;


    const renderSponsorResults = (searchTerm) => {
        sponsorSearchResults.replaceChildren();
        const normalizedSearch = searchTerm.trim().toLocaleLowerCase();

        if (!normalizedSearch) return;

        const matches = sponsorProfiles
            .filter((profile) => profile.uid !== applicationUser?.uid)
            .filter(isActiveSponsorProfile)
            .filter((profile) => [
                profile.displayName,
                profile.firstName,
                profile.lastName,
                profile.preferredName
            ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedSearch)))
            .slice(0, 8);

        if (!matches.length) {
            const message = document.createElement("p");
            message.className = "profile-muted";
            message.textContent = "No matching current members found.";
            sponsorSearchResults.appendChild(message);
            return;
        }

        matches.forEach((profile) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = profile.displayName ||
                `${profile.preferredName || profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
                "WBA Member";
            button.addEventListener("click", () => {
                selectedSponsorUserId = profile.uid;
                selectedSponsorDisplayName = button.textContent;
                sponsorRequested = false;
                sponsorSearchInput.value = "";
                sponsorSearchResults.replaceChildren();
                renderSelectedSponsor();
            });
            sponsorSearchResults.appendChild(button);
        });
    };


    sponsorSearchInput.addEventListener("input", () => {
        renderSponsorResults(sponsorSearchInput.value);
    });


    document.getElementById("clearSponsorButton").addEventListener("click", () => {
        selectedSponsorUserId = "";
        selectedSponsorDisplayName = "";
        sponsorRequested = false;
        renderSelectedSponsor();
    });


    document.getElementById("sponsorRequested").addEventListener("change", (event) => {
        sponsorRequested = event.target.checked;
        if (sponsorRequested) {
            selectedSponsorUserId = "";
            selectedSponsorDisplayName = "";
            sponsorSearchInput.value = "";
            sponsorSearchResults.replaceChildren();
        }
        renderSelectedSponsor();
    });


    const collectCustomQuestionResponses = () => {
        const activeQuestionIds = new Set(
            applicationQuestions.filter((question) => question.active).map((question) => question.id)
        );
        const preservedInactiveResponses = Array.isArray(currentApplication?.customQuestionResponses)
            ? currentApplication.customQuestionResponses.filter(
                (response) => !activeQuestionIds.has(response.questionId)
            )
            : [];
        const activeResponses = applicationQuestions.filter((question) => question.active).map((question) => {
            const wrapper = Array.from(applicationCustomQuestions.children).find(
                (element) => element.dataset.questionId === question.id
            );
            let answer = null;
            if (question.type === "shortText" || question.type === "longText") {
                answer = wrapper?.querySelector("input, textarea")?.value.trim() || "";
            } else if (question.type === "yesNo") {
                const value = wrapper?.querySelector("input:checked")?.value;
                answer = value === "yes" ? true : value === "no" ? false : null;
            } else if (question.type === "singleSelect") {
                answer = wrapper?.querySelector("input:checked")?.value || "";
            } else if (question.type === "multiSelect") {
                answer = Array.from(
                    wrapper?.querySelectorAll("input:checked") || [],
                    (input) => input.value
                );
            }
            const response = {
                questionId: question.id,
                questionLabel: question.label,
                questionType: question.type,
                required: question.required,
                answer
            };
            if (question.type === "yesNo" && question.requiresExplanationWhen) {
                response.requiresExplanationWhen = true;
                response.explanationLabel = question.explanationLabel || "Please explain.";
                response.explanation = wrapper?.querySelector("[data-question-explanation]")?.value.trim() || "";
            }
            return response;
        });
        return [...preservedInactiveResponses, ...activeResponses];
    };


    const collectApplicationData = () => {
        const data = {};
        Object.entries(applicationFieldIds).forEach(([fieldName, elementId]) => {
            data[fieldName] = document.getElementById(elementId).value.trim();
        });

        data.customQuestionResponses = collectCustomQuestionResponses();
        data.bylawsAccepted = document.getElementById("bylawsAccepted").checked;
        data.codeOfEthicsAccepted = document.getElementById("codeOfEthicsAccepted").checked;
        data.communicationsConsent = document.getElementById("communicationsConsent").checked;
        const selectedCountry = getCountry(applicationCountrySelect.value);
        const selectedSubdivision = selectedCountry?.subdivisions.find(
            (subdivision) => subdivision.code === applicationSubdivisionSelect.value
        ) || null;
        data.countryCode = selectedCountry?.code || "";
        data.countryName = selectedCountry?.name || "";
        data.subdivisionCode = selectedSubdivision?.code || "";
        data.subdivisionName = selectedSubdivision?.name || "";
        data.membershipDuesAmount =
            membershipConfig[data.membershipType]?.annualDues ?? null;
        // Readable aliases remain temporarily for legacy consumers.
        data.country = data.countryName || unmappedApplicationCountry;
        data.state = data.subdivisionName || unmappedApplicationSubdivision;
        data.sponsorRequested = sponsorRequested;
        if (selectedSponsorUserId && !sponsorRequested) {
            data.sponsorUserId = selectedSponsorUserId;
            data.sponsorDisplayName = selectedSponsorDisplayName;
        }
        return data;
    };


    const validateMembershipApplicationSubmission = (data, user) => {
        if (!user.emailVerified) {
            return "You must verify your email address before submitting your application.";
        }

        const requiredLabels = {
            firstName: "First Name",
            lastName: "Last Name",
            email: "Email",
            phone: "Phone",
            address: "Street Address",
            city: "City",
            zip: "ZIP / Postal Code",
            countryCode: "Country",
            membershipType: "Membership Type"
        };

        const missingFields = Object.entries(requiredLabels)
            .filter(([fieldName]) => !data[fieldName])
            .map(([, label]) => label);

        if (missingFields.length) {
            return `Please complete the following required fields: ${missingFields.join(", ")}.`;
        }
        if (!MEMBERSHIP_TYPES.includes(data.membershipType)) {
            return "Please select a valid membership type.";
        }
        if (!membershipConfig[data.membershipType]?.active) {
            return "The selected membership type is not currently available.";
        }
        if (data.membershipDuesAmount !== membershipConfig[data.membershipType].annualDues) {
            return "Membership pricing changed while this application was open. Please review the current membership option and try again.";
        }
        const selectedCountry = getCountry(data.countryCode);
        if (
            selectedCountry?.subdivisions.length > 0 &&
            !data.subdivisionCode
        ) {
            return "Please select a State / Province / Region for the selected country.";
        }
        const eligibilityMessage =
            validateMembershipTypeEligibility(data, getDraftMembershipYear());
        if (eligibilityMessage) return eligibilityMessage;
        if (!data.bylawsAccepted || !data.codeOfEthicsAccepted) {
            return "You must accept the WBA Bylaws and Code of Ethics before submitting.";
        }
        if (!data.communicationsConsent) {
            return "You must accept electronic communications before submitting.";
        }
        const activeQuestionIds = new Set(
            applicationQuestions.filter((question) => question.active).map((question) => question.id)
        );
        const invalidRequiredQuestion = data.customQuestionResponses.find(
            (response) => activeQuestionIds.has(response.questionId) &&
                !hasValidRequiredQuestionAnswer(response)
        );
        if (invalidRequiredQuestion) {
            return `Please answer: ${invalidRequiredQuestion.questionLabel}`;
        }
        const missingRequiredExplanation = data.customQuestionResponses.find(
            (response) => activeQuestionIds.has(response.questionId) &&
                response.requiresExplanationWhen === true &&
                response.answer === true &&
                (!response.explanation || !response.explanation.trim())
        );
        if (missingRequiredExplanation) {
            return `Please provide an explanation for: ${missingRequiredExplanation.questionLabel}`;
        }
        const invalidOptionResponse = data.customQuestionResponses.find((response) => {
            if (!activeQuestionIds.has(response.questionId)) return false;
            if (!["singleSelect", "multiSelect"].includes(response.questionType)) return false;
            const question = applicationQuestions.find(
                (candidate) => candidate.id === response.questionId
            );
            const allowedIds = new Set(
                getApplicationQuestionOptions(question || {}).map((option) => option.id)
            );
            const answers = Array.isArray(response.answer) ? response.answer : [response.answer];
            return answers.some((answer) => answer && !allowedIds.has(answer));
        });
        if (invalidOptionResponse) {
            return `Please select a valid answer for: ${invalidOptionResponse.questionLabel}`;
        }

        if (data.sponsorRequested) {
            if (data.sponsorUserId || data.sponsorDisplayName) {
                return "Please choose either an Active sponsor or Sponsor Request, not both.";
            }
        } else {
            if (!data.sponsorUserId || !data.sponsorDisplayName) {
                return "Please select an Active WBA sponsor or choose Sponsor Request.";
            }
            const selectedProfile = sponsorProfiles.find(
                (profile) => profile.uid === data.sponsorUserId
            );
            if (!isActiveSponsorProfile(selectedProfile)) {
                return "The selected sponsor is no longer eligible. Please select another Active WBA member or choose Sponsor Request.";
            }
        }

        return "";
    };


    const buildApplicationWriteData = (applicationStatus) => {
        const now = new Date().toISOString();
        const isResubmission = currentApplication?.applicationStatus === "Needs Revision" &&
            applicationStatus === "Submitted";
        const revisionMetadata = currentApplication?.revisionRequestMessage
            ? {
                revisionRequestMessage: currentApplication.revisionRequestMessage,
                revisionRequestedAt: currentApplication.revisionRequestedAt,
                revisionRequestedBy: currentApplication.revisionRequestedBy
            }
            : {};
        return {
            applicantUid: applicationUser.uid,
            ...collectApplicationData(),
            membershipYear: currentApplication?.membershipYear || applicableMembershipYear,
            applicationVersion: currentApplicationVersion,
            applicationStatus,
            createdAt: currentApplication?.createdAt || now,
            updatedAt: now,
            ...revisionMetadata,
            ...(isResubmission
                ? { resubmittedAt: now }
                : currentApplication?.resubmittedAt
                    ? { resubmittedAt: currentApplication.resubmittedAt }
                    : {}),
            ...(currentApplication?.submittedAt
                ? { submittedAt: currentApplication.submittedAt }
                : applicationStatus === "Submitted"
                    ? { submittedAt: now }
                    : {})
        };
    };


    const setApplicationReadOnly = (readOnly) => {
        membershipApplicationForm.querySelectorAll("input, select, textarea, button")
            .forEach((control) => {
                control.disabled = readOnly;
            });
        document.getElementById("applicationFormActions").hidden = readOnly;
        if (readOnly) {
            sponsorSearchResults.replaceChildren();
        }
    };


    const populateApplicationForm = (applicationData, userData, authenticatedUser) => {
        const hasSavedValue = (fieldName) =>
            Object.prototype.hasOwnProperty.call(applicationData || {}, fieldName);

        Object.entries(applicationFieldIds).forEach(([fieldName, elementId]) => {
            const fallbackValue = fieldName === "email"
                ? authenticatedUser.email || userData.email || ""
                : userData[fieldName] || "";
            document.getElementById(elementId).value =
                hasSavedValue(fieldName) ? applicationData[fieldName] || "" : fallbackValue;
        });
        renderMembershipTypeCards(applicationMembershipType.value);

        const countrySource = (
            hasSavedValue("countryCode") ||
            hasSavedValue("countryName") ||
            hasSavedValue("country")
        ) ? applicationData : userData;
        const resolvedCountry = resolveCountry(
            countrySource?.countryCode,
            countrySource?.countryName || countrySource?.country
        );
        unmappedApplicationCountry = resolvedCountry
            ? ""
            : countrySource?.countryName || countrySource?.country || "";
        populateCountrySelect(applicationCountrySelect, resolvedCountry?.code || "");

        const subdivisionSource = (
            hasSavedValue("subdivisionCode") ||
            hasSavedValue("subdivisionName") ||
            hasSavedValue("state")
        ) ? applicationData : userData;
        const resolvedSubdivision = resolveSubdivision(
            resolvedCountry,
            subdivisionSource?.subdivisionCode,
            subdivisionSource?.subdivisionName || subdivisionSource?.state
        );
        unmappedApplicationSubdivision = resolvedSubdivision
            ? ""
            : subdivisionSource?.subdivisionName || subdivisionSource?.state || "";
        populateSubdivisionSelect(
            applicationSubdivisionSelect,
            resolvedCountry?.code || "",
            resolvedSubdivision?.code || ""
        );

        document.getElementById("bylawsAccepted").checked = applicationData?.bylawsAccepted === true;
        document.getElementById("codeOfEthicsAccepted").checked = applicationData?.codeOfEthicsAccepted === true;
        document.getElementById("communicationsConsent").checked = applicationData?.communicationsConsent === true;

        const savedQuestionResponses = new Map(
            getApplicationQuestionResponses(applicationData).map((response) => [
                response.questionId,
                response.answer
            ])
        );
        Array.from(applicationCustomQuestions.children).forEach((wrapper) => {
            const answer = savedQuestionResponses.get(wrapper.dataset.questionId);
            if (wrapper.dataset.questionType === "shortText" || wrapper.dataset.questionType === "longText") {
                wrapper.querySelector("input, textarea").value = typeof answer === "string" ? answer : "";
            } else if (wrapper.dataset.questionType === "yesNo") {
                const value = answer === true ? "yes" : answer === false ? "no" : "";
                wrapper.querySelectorAll("input").forEach((input) => {
                    input.checked = input.value === value;
                });
                const response = getApplicationQuestionResponses(applicationData).find(
                    (candidate) => candidate.questionId === wrapper.dataset.questionId
                );
                const explanation = wrapper.querySelector("[data-question-explanation]");
                if (explanation) {
                    explanation.value = response?.explanation || "";
                    explanation.closest(".custom-question-explanation").hidden = answer !== true;
                }
            } else {
                const selected = new Set(Array.isArray(answer) ? answer : [answer]);
                wrapper.querySelectorAll("input").forEach((input) => {
                    input.checked = selected.has(input.value);
                });
            }
        });

        selectedSponsorUserId = applicationData?.sponsorUserId || "";
        selectedSponsorDisplayName = applicationData?.sponsorDisplayName || "";
        sponsorRequested = applicationData?.sponsorRequested === true;
        if (sponsorRequested) {
            selectedSponsorUserId = "";
            selectedSponsorDisplayName = "";
        }
        renderSelectedSponsor();
        updateMembershipEligibilityMessage();

    };


    const renderApplicationVerificationState =
        (user) => {

            if (user.emailVerified) {

                document.getElementById(
                    "applicationEmailStatus"
                ).textContent = "Verified";

                applicationVerificationHeading.textContent =
                    "Email Verified";

                applicationVerificationMessage.textContent =
                    "Your email has been verified. You may continue your membership application.";

                applicationResendButton.hidden = true;
                applicationRefreshButton.hidden = true;

                return;

            }


            applicationVerificationHeading.textContent =
                "Email Verification Pending";

            document.getElementById(
                "applicationEmailStatus"
            ).textContent = "Verification Pending";

            applicationVerificationMessage.textContent =
                verificationState === "failed"
                    ? "Your account has been created, but we couldn't send the verification email. You can request another verification email here or from the Login page. You may begin your membership application now, but your email must be verified before it can be submitted."
                    : "Your account has been created. We sent a verification email to your email address. You may begin your membership application now, but your email must be verified before the application can be submitted.";

            applicationResendButton.hidden = false;
            applicationRefreshButton.hidden = false;

        };


    saveApplicationDraftButton.addEventListener(
        "click",
        async () => {

            if (!applicationUser) return;

            if (currentApplication && !["Draft", "Needs Revision"].includes(currentApplication.applicationStatus)) {
                applicationFormMessage.textContent =
                    "This application is no longer editable.";
                return;
            }

            applicationFormMessage.textContent = "Saving your draft...";


            try {
                const selectedType = applicationMembershipType.value;
                membershipConfig = await loadMembershipConfig();
                renderMembershipTypeCards(selectedType);
                const savedStatus = currentApplication?.applicationStatus === "Needs Revision"
                    ? "Needs Revision"
                    : "Draft";
                const draftData = buildApplicationWriteData(savedStatus);
                await setDoc(
                    doc(db, "membershipApplications", applicationUser.uid),
                    draftData
                );
                currentApplication = draftData;
                document.getElementById("applicationStatus").textContent = savedStatus;
                applicationFormMessage.textContent =
                    savedStatus === "Needs Revision"
                        ? "Your application revisions have been saved. Submit when your corrections are complete."
                        : "Your application draft has been saved.";
            } catch (error) {
                console.error("Application draft could not be saved.", error);
                applicationFormMessage.textContent =
                    "We couldn't save your draft. Please try again.";
            }

        }
    );


    membershipApplicationForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();
            const user = auth.currentUser;

            if (!user) {
                window.location.href = "login.html";
                return;
            }

            if (currentApplication && !["Draft", "Needs Revision"].includes(currentApplication.applicationStatus)) {
                applicationFormMessage.textContent =
                    "This application has already been submitted and cannot be edited.";
                return;
            }

            try {
                await user.reload();
                if (user.emailVerified) {
                    await user.getIdToken(true);
                }
            } catch (error) {
                console.error("Email verification could not be checked before submission.", error);
            }

            if (selectedSponsorUserId && !sponsorRequested) {
                try {
                    const sponsorSnapshot = await getDoc(
                        doc(db, "memberProfiles", selectedSponsorUserId)
                    );
                    sponsorProfiles = sponsorProfiles.filter(
                        (profile) => profile.uid !== selectedSponsorUserId
                    );
                    if (sponsorSnapshot.exists()) {
                        sponsorProfiles.push({
                            ...sponsorSnapshot.data(),
                            uid: sponsorSnapshot.id,
                            documentId: sponsorSnapshot.id
                        });
                    }
                } catch (error) {
                    console.error("Sponsor eligibility could not be refreshed.", error);
                    applicationFormMessage.textContent =
                        "We couldn't verify the selected sponsor's current eligibility. Please try again.";
                    return;
                }
            }

            const selectedType = applicationMembershipType.value;
            membershipConfig = await loadMembershipConfig();
            renderMembershipTypeCards(selectedType);

            renderApplicationVerificationState(user);
            const submissionData = buildApplicationWriteData("Submitted");
            const validationMessage =
                validateMembershipApplicationSubmission(submissionData, user);

            if (validationMessage) {
                applicationFormMessage.textContent = validationMessage;
                return;
            }

            applicationFormMessage.textContent = "Submitting your application...";
            const isRevisionResubmission = currentApplication?.applicationStatus === "Needs Revision";

            try {
                const applicationRef = doc(db, "membershipApplications", user.uid);
                if (isRevisionResubmission) {
                    const correctedRevisionData = buildApplicationWriteData("Needs Revision");
                    await setDoc(applicationRef, correctedRevisionData);
                    const resubmissionTransition = {
                        applicationStatus: "Submitted",
                        updatedAt: submissionData.updatedAt,
                        resubmittedAt: submissionData.resubmittedAt
                    };
                    console.log("[Application Resubmission Transition Debug]", {
                        oldStatus: correctedRevisionData.applicationStatus,
                        newStatus: resubmissionTransition.applicationStatus,
                        writeKeys: Object.keys(resubmissionTransition),
                        submittedAtPresent: Boolean(correctedRevisionData.submittedAt),
                        resubmittedAtPresent: Boolean(resubmissionTransition.resubmittedAt),
                        revisionMessagePresent: Boolean(correctedRevisionData.revisionRequestMessage),
                        revisionRequestedAtPresent: Boolean(correctedRevisionData.revisionRequestedAt),
                        revisionRequestedByPresent: Boolean(correctedRevisionData.revisionRequestedBy)
                    });
                    await updateDoc(applicationRef, resubmissionTransition);
                } else {
                    await setDoc(applicationRef, submissionData);
                }
                currentApplication = submissionData;
                document.getElementById("applicationStatus").textContent = "Submitted";
                applicationFormMessage.textContent =
                    "Your application has been submitted for review.";
                setApplicationReadOnly(true);
                if (isRevisionResubmission) {
                    window.location.href = "membership-status.html";
                }
            } catch (error) {
                console.error("Application could not be submitted.", error);
                applicationFormMessage.textContent =
                    "We couldn't submit your application. Your information is still available on this page; please try again.";
            }

        }
    );


    applicationResendButton.addEventListener(
        "click",
        async () => {

            const user = auth.currentUser;


            if (!user) {
                window.location.href = "login.html";
                return;
            }


            if (user.emailVerified) {
                renderApplicationVerificationState(user);
                return;
            }


            applicationVerificationMessage.textContent =
                "Sending a new verification email...";


            try {

                await sendVerificationEmail(
                    user,
                    "membership application resend"
                );

                verificationState = "sent";
                window.history.replaceState(
                    {},
                    "",
                    "membership-application.html?verification=sent"
                );

                applicationVerificationMessage.textContent =
                    "A new verification email has been sent. You may continue working on your application while you verify your email.";

            } catch (error) {

                applicationVerificationMessage.textContent =
                    "We couldn't send the verification email. Please try again later or use the resend option on the Login page.";

            }

        }
    );


    applicationRefreshButton.addEventListener(
        "click",
        async () => {

            const user = auth.currentUser;


            if (!user) {
                window.location.href = "login.html";
                return;
            }


            try {

                await user.reload();
                renderApplicationVerificationState(user);

                if (!user.emailVerified) {
                    applicationVerificationMessage.textContent =
                        "Your email is still awaiting verification. You may continue working on your application in the meantime.";
                }

            } catch (error) {

                console.error(
                    "Application verification status could not be refreshed.",
                    error
                );

                applicationVerificationMessage.textContent =
                    "We couldn't refresh your verification status. Please try again.";

            }

        }
    );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (!authenticatedUser) {
                window.location.replace("login.html");
                return;
            }


            try {
                await authenticatedUser.reload();
            } catch (error) {
                console.error(
                    "Application verification status could not be loaded.",
                    error
                );
            }


            const refreshedApplicationUser =
                auth.currentUser || authenticatedUser;


            if (refreshedApplicationUser.emailVerified) {
                try {
                    const applicationRoute =
                        await getPostLoginRoute(
                            refreshedApplicationUser,
                            { allowRevisionEditing: true }
                        );

                    if (applicationRoute.destination !== "membership-application.html") {
                        redirectToPage(
                            applicationRoute.destination,
                            "membership-application-route-guard",
                            {
                                authenticatedUser: refreshedApplicationUser,
                                authorization: applicationRoute.authorization,
                                memberRecordExists: applicationRoute.memberRecordExists
                            }
                        );
                        return;
                    }
                } catch (error) {
                    console.error(
                        "Membership application routing could not be determined.",
                        error
                    );
                }
            }


            renderApplicationVerificationState(
                refreshedApplicationUser
            );

            applicationUser =
                refreshedApplicationUser;


            try {
                const applicationRef =
                    doc(
                        db,
                        "membershipApplications",
                        applicationUser.uid
                    );

                const [applicationSnapshot, userSnapshot, memberProfilesSnapshot, loadedMembershipConfig, loadedApplicationConfiguration] =
                    await Promise.all([
                        getDoc(applicationRef),
                        getDoc(doc(db, "users", applicationUser.uid)),
                        getDocs(collection(db, "memberProfiles")),
                        loadMembershipConfig(),
                        loadMembershipApplicationConfiguration()
                    ]);

                membershipConfig = loadedMembershipConfig;
                const applicationExists = applicationSnapshot.exists();
                currentApplication = applicationExists
                    ? applicationSnapshot.data()
                    : null;
                const applicationStatus = currentApplication?.applicationStatus || null;
                const frozenApplicationStatuses = new Set([
                    "Submitted",
                    "Awaiting Board Decision",
                    "Approved",
                    "Declined"
                ]);
                const usesFrozenApplicationSnapshot = frozenApplicationStatuses.has(applicationStatus);
                const savedApplicationVersion = Number.isInteger(currentApplication?.applicationVersion)
                    ? currentApplication.applicationVersion
                    : null;
                currentApplicationVersion = usesFrozenApplicationSnapshot && savedApplicationVersion !== null
                    ? savedApplicationVersion
                    : loadedApplicationConfiguration.version;

                applicationQuestions = usesFrozenApplicationSnapshot
                    ? getApplicationQuestionResponses(currentApplication).map((response, index) => ({
                        id: response.questionId,
                        label: response.questionLabel,
                        type: response.questionType,
                        required: response.required,
                        active: true,
                        order: index,
                        requiresExplanationWhen: response.requiresExplanationWhen === true,
                        explanationLabel: response.explanationLabel || "Please explain.",
                        optionSource: response.questionId === "dog-sports"
                            ? "DOG_SPORT_OPTIONS"
                            : undefined
                    }))
                    : loadedApplicationConfiguration.questions;
                console.log("[Application Config Selection Debug]", {
                    applicationExists,
                    applicationStatus,
                    savedApplicationVersion,
                    currentLiveVersion: loadedApplicationConfiguration.version,
                    selectedVersion: currentApplicationVersion,
                    configSource: usesFrozenApplicationSnapshot
                        ? "saved-application-snapshot"
                        : loadedApplicationConfiguration.configSource
                });
                renderApplicationQuestions();

                const userData = userSnapshot.exists()
                    ? userSnapshot.data()
                    : {};

                sponsorProfiles = memberProfilesSnapshot.docs.map((profileSnapshot) => ({
                    ...profileSnapshot.data(),
                    uid: profileSnapshot.id,
                    documentId: profileSnapshot.id
                }));

                populateApplicationForm(
                    currentApplication,
                    userData,
                    applicationUser
                );

                const displayedApplicationStatus =
                    currentApplication?.applicationStatus || "Draft";

                document.getElementById("applicationStatus").textContent =
                    displayedApplicationStatus;

                const isRevision = displayedApplicationStatus === "Needs Revision";
                document.getElementById("applicationRevisionBanner").hidden = !isRevision;
                document.getElementById("applicationRevisionMessage").textContent =
                    isRevision
                        ? currentApplication.revisionRequestMessage || "Please review your application and provide the requested information."
                        : "";

                if (displayedApplicationStatus !== "Draft" && !isRevision) {
                    setApplicationReadOnly(true);
                    applicationFormMessage.textContent =
                        displayedApplicationStatus === "Submitted"
                            ? "Your application has been submitted for review."
                            : `Your application status is ${displayedApplicationStatus}. This application is read-only.`;
                }

            } catch (error) {
                console.error("Membership application could not be loaded.", error);
                applicationFormMessage.textContent =
                    "We couldn't load your saved application. Please refresh and try again.";
                setApplicationReadOnly(true);
            }

            membershipApplicationPage.hidden = false;

            document.getElementById(
                "membershipApplicationAccessMessage"
            ).hidden = true;

        }
    );

}


// ------------------------------------
// Membership Status / Progress
// ------------------------------------

const membershipProgress =
    document.getElementById("membershipProgress");


if (membershipProgress) {

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser) {
            window.location.replace("login.html");
            return;
        }

        try {
            await authenticatedUser.reload();
            const currentUser = auth.currentUser || authenticatedUser;
            const route = await getPostLoginRoute(currentUser);

            if (route.destination !== "membership-status.html") {
                redirectToPage(route.destination, "membership-status-route-guard", {
                    authenticatedUser: currentUser,
                    authorization: route.authorization,
                    memberRecordExists: route.memberRecordExists
                });
                return;
            }

            const membershipStatus = route.userData.membershipStatus || "";
            const applicationStatus = route.applicationData?.applicationStatus || "";
            const heading = document.getElementById("membershipProgressHeading");
            const message = document.getElementById("membershipProgressMessage");
            const nextStep = document.getElementById("membershipProgressNextStepMessage");
            const revisionPanel = document.getElementById("applicationRevisionPanel");

            document.getElementById("progressApplicationStatus").textContent =
                applicationStatus || "No Application";
            document.getElementById("progressMembershipStatus").textContent =
                membershipStatus || "No Current Membership";
            document.getElementById("progressSponsorStatusDetail").hidden =
                route.applicationData?.sponsorRequested !== true;
            revisionPanel.hidden = applicationStatus !== "Needs Revision";
            document.getElementById("applicationRevisionRequestMessage").textContent =
                applicationStatus === "Needs Revision"
                    ? route.applicationData?.revisionRequestMessage || "Please review your application and provide the requested information."
                    : "";

            if (applicationStatus === "Needs Revision") {
                heading.textContent = "Application Needs Additional Information";
                message.textContent = "Your application has been reviewed and additional information or clarification is needed before it can be forwarded to the WBA Board of Directors.";
                nextStep.textContent = "Review the requested changes below, then edit and resubmit your application.";
            } else if (membershipStatus === "Pending Dues") {
                heading.textContent = "Application Approved — Membership Dues Pending";
                message.textContent = "Your application has been approved. Your membership will become Active after the required dues step is completed.";
                nextStep.textContent = "Online dues and payment functionality will be added later. The WBA will provide further instructions.";
            } else if (membershipStatus === "Past Due" || membershipStatus === "Archived") {
                heading.textContent = "Membership Inactive";
                message.textContent = "Your WBA membership is currently inactive.";
                nextStep.textContent = "Renewal and reactivation options will be added in a future update.";
            } else if (membershipStatus === "Suspended" || membershipStatus === "Expelled") {
                heading.textContent = "Membership Access Restricted";
                message.textContent = "Your WBA membership is not currently eligible for Member Portal access.";
                nextStep.textContent = "Please contact the WBA if you need assistance with your membership status.";
            } else if (applicationStatus === "Declined") {
                heading.textContent = "Application Declined";
                message.textContent = "Your membership application is no longer under review.";
                nextStep.textContent = "Reapplication options are not available in the portal yet.";
            } else if (applicationStatus === "Withdrawn") {
                heading.textContent = "Application Withdrawn";
                message.textContent = "This membership application has been withdrawn.";
                nextStep.textContent = "Reapplication options are not available in the portal yet.";
            } else if (applicationStatus === "Approved") {
                heading.textContent = "Application Approved";
                message.textContent = "Your membership application has been approved, but your membership is not Active yet.";
                nextStep.textContent = "The WBA will provide information about the remaining membership steps.";
            } else if (applicationStatus === "Awaiting Board Decision") {
                heading.textContent = "Application Under Board Review";
                message.textContent = "Your application has completed its initial review and is awaiting a Board decision.";
                nextStep.textContent = "No action is required while the Board reviews your application.";
            } else if (applicationStatus === "Submitted") {
                heading.textContent = "Application Submitted — Awaiting Initial Review";
                message.textContent = "Your application has been submitted and is awaiting its initial completeness review.";
                nextStep.textContent = route.applicationData?.sponsorRequested === true
                    ? "Sponsor Request Pending: the WBA is working to help identify an eligible sponsor."
                    : "No action is required while your application is reviewed.";
            } else if (membershipStatus === "Pending Application") {
                heading.textContent = "Membership Application Pending";
                message.textContent = applicationStatus === "Draft"
                    ? "Your membership application is still in progress."
                    : "Your membership application is awaiting the next review step.";
                nextStep.textContent = "Return here for updates about your application progress.";
            } else {
                heading.textContent = "Application in Progress";
                message.textContent = "Your application has been submitted and is awaiting review.";
                nextStep.textContent = route.applicationData?.sponsorRequested === true
                    ? "Sponsor Request Pending: the WBA is working to help identify an eligible sponsor."
                    : "No action is required while your application is being reviewed.";
            }

            membershipProgress.hidden = false;
            document.getElementById("membershipStatusAccessMessage").hidden = true;
        } catch (error) {
            console.error("Membership progress could not be loaded.", error);
            document.getElementById("membershipStatusAccessMessage").textContent =
                "We couldn't load your membership progress. Please try again.";
        }
    });

}

// ------------------------------------
// Login
// ------------------------------------

const loginForm =
    document.getElementById("loginForm");


if (loginForm) {

    const message =
        document.getElementById("message");

    const verificationOptions =
        document.getElementById("verificationOptions");

    const resendVerificationButton =
        document.getElementById("resendVerificationButton");

    const refreshVerificationButton =
        document.getElementById("refreshVerificationButton");


    loginForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value;


            message.textContent = "";

            verificationOptions.style.display =
                "none";


            try {

                const userCredential =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    userCredential.user;


                if (!user.emailVerified) {

                    message.textContent =
                        "Your account is valid, but your email address has not been verified yet.";

                    verificationOptions.style.display =
                        "block";

                    return;
                }


                const authorization = await getAdminAuthorization(user);
                const isSystemSuperAdmin =
                    authorization?.active === true && authorization?.superAdmin === true;

                if (!isSystemSuperAdmin) {
                    const userRef = doc(db, "users", user.uid);
                    const userSnapshot = await getDoc(userRef);

                    if (!userSnapshot.exists()) {
                        await setDoc(userRef, {
                            email: user.email,
                            profileCompleted: false,
                            createdAt: new Date().toISOString()
                        });
                        console.log("New user profile created in Firestore.");
                    } else {
                        console.log("Existing user profile found in Firestore.");
                    }
                } else {
                    console.log("Super Admin system account authenticated without member-profile creation.");
                }


                await routeAuthenticatedUser(user);

            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't log you in. Please check your email address and password.";

            }

        }
    );


    // --------------------------------
    // Resend Verification
    // --------------------------------

    if (resendVerificationButton) {

        resendVerificationButton.addEventListener(
            "click",
            async () => {

                const user =
                    auth.currentUser;


                if (!user) {

                    message.textContent =
                        "Please log in again before requesting another verification email.";

                    return;
                }


                try {

                    await sendVerificationEmail(
                        user,
                        "manual resend"
                    );


                    message.textContent =
                        "A new verification email has been sent. Please check your email.";

                } catch (error) {

                    message.textContent =
                        "We couldn't send the verification email. Please try again later.";

                }

            }
        );

    }


    // --------------------------------
    // Check Verification Again
    // --------------------------------

    if (refreshVerificationButton) {

        refreshVerificationButton.addEventListener(
            "click",
            async () => {

                const user =
                    auth.currentUser;


                if (!user) {

                    message.textContent =
                        "Please log in again.";

                    return;
                }


                await user.reload();


                if (user.emailVerified) {

                    message.textContent =
                        "Your email has been verified.";

                    verificationOptions.style.display =
                        "none";

                } else {

                    message.textContent =
                        "Your email is still not verified. Please use the link in the verification email.";

                }

            }
        );

    }

}


// ------------------------------------
// Forgot Password
// ------------------------------------

const forgotPasswordLink =
    document.getElementById("forgotPasswordLink");


if (forgotPasswordLink) {

    forgotPasswordLink.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email").value.trim();

            const message =
                document.getElementById("message");


            if (!email) {

                message.textContent =
                    "Enter your email address first, then select Forgot your password.";

                return;
            }


            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );


                message.textContent =
                    "If an account exists for that email address, a password reset email has been sent.";

            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't process the password reset request. Please try again.";

            }

        }
    );

}


console.log("WBA Member Portal loaded.");


// ------------------------------------
// Member-Readable Profile Data
// ------------------------------------

const buildDisplayLocation =
    (profileData, visibility) => {

        const locationParts = {
            full: [
                profileData.address,
                profileData.city,
                profileData.subdivisionName || profileData.state,
                profileData.zip,
                profileData.countryName || profileData.country
            ],
            cityState: [
                profileData.city,
                profileData.subdivisionName || profileData.state
            ],
            state: [
                profileData.subdivisionName || profileData.state
            ],
            country: [
                profileData.countryName || profileData.country
            ]
        };

        const selectedParts =
            locationParts[visibility];


        if (!selectedParts) {
            return "";
        }


        return selectedParts
            .filter(Boolean)
            .join(", ");

    };


const getMemberFacingStatus =
    (membershipStatus) => {

        const normalizedStatus =
            String(membershipStatus || "")
                .trim()
                .toLocaleLowerCase();


        if (
            normalizedStatus === "active" ||
            normalizedStatus === "renewals pending"
        ) {
            return "Active";
        }


        const inactiveStatuses = [
            "inactive",
            "archived",
            "expired",
            "lapsed",
            "past due",
            "resigned",
            "suspended",
            "expelled"
        ];


        if (inactiveStatuses.includes(normalizedStatus)) {
            return "Inactive";
        }


        return "No Membership";

    };


const buildMemberProfileData =
    (uid, sourceData) => {

        const privacy =
            sourceData.privacy || {};

        const firstName =
            sourceData.firstName || "";

        const lastName =
            sourceData.lastName || "";

        const preferredNameIsVisible =
            privacy.preferredName !== "private";

        const preferredName =
            preferredNameIsVisible
                ? sourceData.preferredName || ""
                : "";

        const locationVisibility =
            privacy.location || "state";

        const memberProfileData = {
            uid,
            firstName,
            lastName,
            displayName:
                `${preferredName || firstName} ${lastName}`
                    .trim(),
            locationVisibility,
            aboutVisibility:
                privacy.about || "members",
            wbaRoles:
                Array.isArray(sourceData.wbaRoles)
                    ? sourceData.wbaRoles
                        .map((role) =>
                            typeof role === "string"
                                ? role
                                : role?.name
                        )
                        .filter(Boolean)
                    : [],
            ...(sourceData.portalRole === "admin" || sourceData.portalRole === "moderator"
                ? { portalRole: sourceData.portalRole }
                : {}),
            membershipStatus:
                getMemberFacingStatus(
                    sourceData.membershipStatus
                ),
            sponsorEligible:
                sourceData.membershipStatus === "Active",
            dogSports:
                Array.isArray(sourceData.dogSports)
                    ? sourceData.dogSports.filter(
                        (sportId) =>
                            DOG_SPORT_IDS.has(sportId)
                    )
                    : [],
            updatedAt:
                sourceData.updatedAt ||
                new Date().toISOString()
        };

        const copyIfPresent =
            (fieldName, value) => {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {

                    memberProfileData[fieldName] =
                        value;

                }

            };


        if (preferredNameIsVisible) {

            copyIfPresent(
                "preferredName",
                preferredName
            );

        }


        copyIfPresent(
            "profilePhotoPath",
            sourceData.profilePhotoPath
        );

        copyIfPresent(
            "profilePhotoUpdatedAt",
            sourceData.profilePhotoUpdatedAt
        );

        copyIfPresent(
            "memberId",
            sourceData.memberId ||
            sourceData.memberNumber
        );

        copyIfPresent(
            "membershipType",
            sourceData.membershipType
        );

        copyIfPresent(
            "membershipStartDate",
            sourceData.membershipStartDate ||
            sourceData.memberSince
        );

        copyIfPresent(
            "membershipCurrentThrough",
            sourceData.membershipCurrentThrough ||
            sourceData.renewalDate
        );


        if (privacy.email === "members") {

            copyIfPresent(
                "email",
                sourceData.email
            );

        }


        if (privacy.phone === "members") {

            copyIfPresent(
                "phone",
                sourceData.phone
            );

        }


        if (privacy.about === "members") {

            copyIfPresent(
                "about",
                sourceData.about
            );

        }


        const displayLocation =
            buildDisplayLocation(
                sourceData,
                locationVisibility
            );


        copyIfPresent(
            "location",
            displayLocation
        );


        return memberProfileData;

    };


// ------------------------------------
// Member Dashboard
// ------------------------------------

const memberDashboard =
    document.getElementById(
        "memberDashboard"
    );


if (memberDashboard) {

    const dashboardMessage =
        document.getElementById(
            "dashboardMessage"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.href =
                    "login.html";

                return;

            }


            try {

                const dashboardRoute =
                    await getPostLoginRoute(
                        authenticatedUser
                    );


                if (dashboardRoute.destination !== "dashboard.html") {
                    redirectToPage(
                        dashboardRoute.destination,
                        "member-dashboard-route-guard",
                        {
                            authenticatedUser,
                            authorization: dashboardRoute.authorization,
                            memberRecordExists: dashboardRoute.memberRecordExists
                        }
                    );
                    return;
                }


                const dashboardProfileData =
                    dashboardRoute.userData;


                const adminDashboardCard =
                    document.getElementById(
                        "adminDashboardCard"
                    );


                if (adminDashboardCard) {

                    try {

                        adminDashboardCard.hidden =
                            !await isAuthorizedAdmin(
                                authenticatedUser
                            );

                    } catch (error) {

                        console.error(
                            "Admin authorization could not be checked.",
                            error
                        );

                        adminDashboardCard.hidden = true;

                    }

                }

                const dashboardDisplayName =
                    `${dashboardProfileData.preferredName || dashboardProfileData.firstName || ""} ${dashboardProfileData.lastName || ""}`
                        .trim() ||
                    "WBA Member";

                const dashboardInitials =
                    `${(dashboardProfileData.firstName || "").charAt(0)}${(dashboardProfileData.lastName || "").charAt(0)}`
                        .toUpperCase() ||
                    "WBA";


                document.getElementById(
                    "dashboardDisplayName"
                ).textContent =
                    dashboardDisplayName;

                document.getElementById(
                    "dashboardInitials"
                ).textContent =
                    dashboardInitials;

                document.getElementById(
                    "dashboardMembershipStatus"
                ).textContent =
                    dashboardProfileData.membershipStatus ||
                    "No Membership";


                if (dashboardProfileData.profilePhotoPath) {

                    const dashboardPhoto =
                        document.getElementById(
                            "dashboardPhoto"
                        );

                    const dashboardPhotoPlaceholder =
                        document.getElementById(
                            "dashboardPhotoPlaceholder"
                        );


                    try {

                        const photoRef =
                            ref(
                                storage,
                                dashboardProfileData.profilePhotoPath
                            );

                        const photoURL =
                            new URL(
                                await getDownloadURL(photoRef)
                            );


                        if (dashboardProfileData.profilePhotoUpdatedAt) {

                            photoURL.searchParams.set(
                                "updatedAt",
                                dashboardProfileData.profilePhotoUpdatedAt
                            );

                        }


                        dashboardPhoto.onerror = () => {

                            dashboardPhoto.style.display =
                                "none";

                            dashboardPhotoPlaceholder.style.display =
                                "flex";

                        };

                        dashboardPhoto.src =
                            photoURL.toString();

                        dashboardPhoto.style.display =
                            "block";

                        dashboardPhotoPlaceholder.style.display =
                            "none";

                    } catch (error) {

                        console.error(
                            "Dashboard profile photo could not be loaded.",
                            error
                        );

                    }

                }


                dashboardMessage.textContent =
                    "";

            } catch (error) {

                console.error(error);

                dashboardMessage.textContent =
                    "We couldn't load your dashboard. Please try again.";

            }

        }
    );

}


// ------------------------------------
// Admin Settings
// ------------------------------------

const guardAdminSettingsPage = (container, accessMessage) => {
    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) {
            window.location.replace("login.html");
            return;
        }
        try {
            const authorization = await getAdminAuthorization(authenticatedUser);
            if (authorization.active !== true) {
                window.location.replace("dashboard.html");
                return;
            }
            container.hidden = false;
            accessMessage.textContent = "";
        } catch (error) {
            console.error("Admin Settings authorization could not be verified.", error);
            window.location.replace("dashboard.html");
        }
    });
};

const adminSettings = document.getElementById("adminSettings");

if (adminSettings) {
    guardAdminSettingsPage(
        adminSettings,
        document.getElementById("adminSettingsAccessMessage")
    );
}

const applicationQuestionsManager = document.getElementById("applicationQuestionsManager");

if (applicationQuestionsManager) {
    const accessMessage = document.getElementById("applicationQuestionsAccessMessage");
    const sourceMessage = document.getElementById("applicationQuestionsSourceMessage");
    const questionList = document.getElementById("applicationQuestionList");
    const managerMessage = document.getElementById("applicationQuestionsMessage");
    const preview = document.getElementById("applicationQuestionsPreview");
    const previewContent = document.getElementById("applicationQuestionsPreviewContent");
    const deleteDialog = document.getElementById("deleteApplicationQuestionDialog");
    const deleteQuestionName = document.getElementById("deleteApplicationQuestionName");
    const versionPlan = document.getElementById("applicationQuestionsVersionPlan");
    const dirtyState = document.getElementById("applicationQuestionsDirtyState");
    const saveQuestionsButton = document.getElementById("saveApplicationQuestionsButton");
    const createVersionOneButton = document.getElementById("createApplicationVersionOneButton");
    const versionHistoryList = document.getElementById("applicationVersionHistoryList");
    const versionDetailDialog = document.getElementById("applicationVersionDetailDialog");
    const versionDetailHeading = document.getElementById("applicationVersionDetailHeading");
    const versionDetailMetadata = document.getElementById("applicationVersionDetailMetadata");
    const versionQuestionList = document.getElementById("applicationVersionQuestionList");
    const restoreVersionButton = document.getElementById("restoreApplicationVersionButton");
    const publishDialog = document.getElementById("publishApplicationVersionDialog");
    const publishDialogHeading = document.getElementById("publishApplicationVersionHeading");
    const publishDialogMessage = document.getElementById("publishApplicationVersionMessage");
    const confirmPublishButton = document.getElementById("confirmPublishApplicationVersionButton");
    const typeLabels = {
        shortText: "Short Text",
        longText: "Long Text",
        yesNo: "Yes / No",
        singleSelect: "Single Select",
        multiSelect: "Multiple Select"
    };
    let settingsAdmin = null;
    let settingsAdminAuthorization = null;
    let questions = [];
    let usingDefaults = false;
    let pendingDeleteQuestion = null;
    let previewMembershipConfig = normalizeMembershipConfig();
    let currentVersion = 0;
    let liveQuestionsSnapshot = [];
    let publishedQuestionIds = new Set();
    let configurationVersions = [];
    let selectedHistoricalVersion = null;
    let publishConfirmationResolver = null;
    let legacyConfigurationData = null;

    const createLoadDebug = (authorization = {}) => ({
        viewerAdmin: authorization.active === true,
        viewerSuperAdmin: authorization.superAdmin === true,
        currentDocumentExists: false,
        currentVersion: null,
        legacyQuestionsPresent: false,
        migrationNeeded: false,
        migrationAttempted: false,
        migrationSucceeded: false,
        versionDocumentPath: null,
        versionDocumentExists: false,
        historicalListAttempted: false,
        failureStage: null
    });

    const requestPublishConfirmation = (heading, message, actionLabel) => new Promise((resolve) => {
        publishDialogHeading.textContent = heading;
        publishDialogMessage.textContent = message;
        confirmPublishButton.textContent = actionLabel;
        publishConfirmationResolver = resolve;
        publishDialog.showModal();
    });

    const serializeQuestionsForPublish = (source = questions) => source.map((question) => ({
        id: question.id,
        label: question.label.trim(),
        type: question.type,
        required: question.required,
        active: question.active,
        order: question.order,
        ...(question.optionSource ? {optionSource: question.optionSource} : {}),
        ...(["singleSelect", "multiSelect"].includes(question.type) && !question.optionSource
            ? {options: question.options.map((option) => ({id: option.id, label: option.label}))}
            : {}),
        ...(question.type === "yesNo" && question.requiresExplanationWhen
            ? {requiresExplanationWhen: true, explanationLabel: question.explanationLabel.trim()}
            : {})
    }));

    const hasUnsavedChanges = () =>
        currentVersion === 0 ||
        JSON.stringify(serializeQuestionsForPublish()) !== JSON.stringify(liveQuestionsSnapshot);

    const updateVersionState = () => {
        const nextVersion = currentVersion + 1;
        const dirty = hasUnsavedChanges();
        versionPlan.textContent = currentVersion > 0
            ? `Current Live Version: ${currentVersion} · Unsaved changes will create Version ${nextVersion}.`
            : `Default Configuration — Not Yet Versioned · First publish will create Version ${nextVersion}.`;
        dirtyState.textContent = currentVersion === 0
            ? `The default configuration is not yet published — saving will create Version ${nextVersion}.`
            : dirty
                ? `Unsaved changes — saving will publish Version ${nextVersion}.`
                : "No unsaved changes.";
        saveQuestionsButton.textContent = `Save & Publish Version ${nextVersion}`;
        saveQuestionsButton.disabled = !dirty;
        document.getElementById("previewApplicationQuestionsButton").textContent = `Preview Proposed Version ${nextVersion}`;
    };

    const slugifyQuestionId = (label) => String(label || "")
        .trim()
        .toLocaleLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "new-question";

    const createUniqueQuestionId = (label, currentQuestion) => {
        const baseId = slugifyQuestionId(label);
        const usedIds = new Set(
            questions.filter((question) => question !== currentQuestion).map((question) => question.id)
        );
        publishedQuestionIds.forEach((questionId) => usedIds.add(questionId));
        let candidate = baseId;
        let suffix = 2;
        while (usedIds.has(candidate)) {
            candidate = `${baseId}-${suffix}`;
            suffix += 1;
        }
        return candidate;
    };

    const serializeOptions = (options = []) => options
        .map((option) => `${option.id} | ${option.label}`)
        .join("\n");

    const parseOptions = (value) => String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const separatorIndex = line.indexOf("|");
            return separatorIndex < 0
                ? { id: line.trim(), label: "" }
                : {
                    id: line.slice(0, separatorIndex).trim(),
                    label: line.slice(separatorIndex + 1).trim()
                };
        });

    const appendLabeledControl = (parent, labelText, control) => {
        const field = document.createElement("div");
        field.className = "form-field";
        const label = document.createElement("label");
        label.textContent = labelText;
        label.appendChild(control);
        field.appendChild(label);
        parent.appendChild(field);
        return field;
    };

    const buildBooleanSelect = (value) => {
        const select = document.createElement("select");
        [{value: "true", label: "Yes"}, {value: "false", label: "No"}]
            .forEach((optionData) => {
                const option = document.createElement("option");
                option.value = optionData.value;
                option.textContent = optionData.label;
                option.selected = String(value) === optionData.value;
                select.appendChild(option);
            });
        return select;
    };

    const renderQuestionManager = () => {
        questionList.replaceChildren();
        questions.sort((left, right) => left.order - right.order).forEach((question) => {
            const card = document.createElement("article");
            card.className = question.active
                ? "question-manager-card"
                : "question-manager-card question-manager-card-inactive";
            card.dataset.questionId = question.id;

            const heading = document.createElement("div");
            heading.className = "question-manager-heading";
            const title = document.createElement("h3");
            title.textContent = question.label || "New Question";
            const status = document.createElement("span");
            status.className = question.active ? "question-status active" : "question-status inactive";
            status.textContent = question.active ? "Active" : "Inactive";
            heading.append(title, status);
            card.appendChild(heading);

            const grid = document.createElement("div");
            grid.className = "question-manager-grid";
            const labelInput = document.createElement("input");
            labelInput.type = "text";
            labelInput.value = question.label;
            labelInput.dataset.questionField = "label";
            appendLabeledControl(grid, "Question Label", labelInput);

            const idInput = document.createElement("input");
            idInput.type = "text";
            idInput.value = question.id;
            idInput.readOnly = question.persisted === true;
            idInput.dataset.questionField = "id";
            const idField = appendLabeledControl(grid, "Question ID", idInput);
            const idHelp = document.createElement("p");
            idHelp.className = "field-help";
            idHelp.textContent = question.persisted
                ? "Question IDs become permanent after the question is first published so historical application responses remain linked correctly."
                : "Edit this machine ID before first publish. Use lowercase letters, numbers, and hyphens.";
            idField.appendChild(idHelp);

            const typeSelect = document.createElement("select");
            Object.entries(typeLabels).forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = value === question.type;
                typeSelect.appendChild(option);
            });
            typeSelect.disabled = question.persisted === true;
            typeSelect.dataset.questionField = "type";
            appendLabeledControl(grid, "Question Type", typeSelect);

            const requiredSelect = buildBooleanSelect(question.required);
            requiredSelect.dataset.questionField = "required";
            appendLabeledControl(grid, "Required", requiredSelect);

            const activeSelect = buildBooleanSelect(question.active);
            activeSelect.dataset.questionField = "active";
            appendLabeledControl(grid, "Active", activeSelect);

            const orderInput = document.createElement("input");
            orderInput.type = "number";
            orderInput.step = "1";
            orderInput.value = question.order;
            orderInput.dataset.questionField = "order";
            appendLabeledControl(grid, "Order", orderInput);
            card.appendChild(grid);

            const optionsPanel = document.createElement("div");
            optionsPanel.className = "question-options-panel";
            const usesOptions = ["singleSelect", "multiSelect"].includes(question.type);
            optionsPanel.hidden = !usesOptions;
            if (question.optionSource === "DOG_SPORT_OPTIONS") {
                const sourceField = document.createElement("div");
                sourceField.className = "system-options-source";
                const sourceLabel = document.createElement("strong");
                sourceLabel.textContent = "Options Source:";
                const sourceValue = document.createElement("span");
                sourceValue.textContent = "Dog Sports & Activities List (system managed)";
                sourceField.append(sourceLabel, sourceValue);
                optionsPanel.appendChild(sourceField);
            } else {
                const sourceNote = document.createElement("p");
                sourceNote.className = "profile-muted";
                sourceNote.textContent = "Enter one option per line as: stable-value | Display Label";
                optionsPanel.appendChild(sourceNote);
                const optionsInput = document.createElement("textarea");
                optionsInput.rows = 5;
                optionsInput.value = serializeOptions(question.options);
                optionsInput.dataset.questionField = "options";
                appendLabeledControl(optionsPanel, "Options", optionsInput);
            }
            card.appendChild(optionsPanel);

            const explanationPanel = document.createElement("div");
            explanationPanel.className = "question-explanation-panel question-manager-grid";
            explanationPanel.hidden = question.type !== "yesNo";
            const explanationSelect = buildBooleanSelect(question.requiresExplanationWhen === true);
            explanationSelect.dataset.questionField = "requiresExplanationWhen";
            appendLabeledControl(explanationPanel, "Require explanation when Yes", explanationSelect);
            const explanationLabel = document.createElement("input");
            explanationLabel.type = "text";
            explanationLabel.value = question.explanationLabel || "Please explain.";
            explanationLabel.dataset.questionField = "explanationLabel";
            const explanationLabelField = appendLabeledControl(explanationPanel, "Explanation Label", explanationLabel);
            explanationLabelField.hidden = question.requiresExplanationWhen !== true;
            card.appendChild(explanationPanel);

            const questionActions = document.createElement("div");
            questionActions.className = "question-manager-actions";
            const actionExplanation = document.createElement("p");
            actionExplanation.className = "profile-muted";
            actionExplanation.textContent = "Deactivate hides this question but keeps it available to reactivate. Delete removes it from the current configuration after you save.";
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "button-danger";
            deleteButton.textContent = "Delete Question";
            deleteButton.addEventListener("click", () => {
                pendingDeleteQuestion = question;
                deleteQuestionName.textContent = question.label || question.id;
                deleteDialog.showModal();
            });
            const actionButtons = document.createElement("div");
            actionButtons.className = "question-manager-action-buttons";
            const activationButton = document.createElement("button");
            activationButton.type = "button";
            activationButton.className = "button-secondary";
            activationButton.textContent = question.active ? "Deactivate" : "Reactivate";
            activationButton.addEventListener("click", () => {
                question.active = !question.active;
                activeSelect.value = String(question.active);
                status.textContent = question.active ? "Active" : "Inactive";
                status.className = question.active ? "question-status active" : "question-status inactive";
                card.classList.toggle("question-manager-card-inactive", !question.active);
                activationButton.textContent = question.active ? "Deactivate" : "Reactivate";
                managerMessage.textContent = question.active
                    ? `“${question.label}” was reactivated. Select Save Application Questions to publish this change.`
                    : `“${question.label}” was deactivated. Select Save Application Questions to publish this change.`;
                updateVersionState();
            });
            actionButtons.append(activationButton, deleteButton);
            questionActions.append(actionExplanation, actionButtons);
            card.appendChild(questionActions);

            const syncQuestionFromCard = () => {
                question.label = labelInput.value;
                if (!question.persisted) question.id = idInput.value.trim();
                question.type = typeSelect.value;
                question.required = requiredSelect.value === "true";
                question.active = activeSelect.value === "true";
                question.order = Number(orderInput.value);
                question.requiresExplanationWhen = question.type === "yesNo" && explanationSelect.value === "true";
                question.explanationLabel = explanationLabel.value;
                question.options = question.optionSource === "DOG_SPORT_OPTIONS"
                    ? []
                    : parseOptions(card.querySelector('[data-question-field="options"]')?.value);
                title.textContent = question.label || "New Question";
                status.textContent = question.active ? "Active" : "Inactive";
                status.className = question.active ? "question-status active" : "question-status inactive";
                card.classList.toggle("question-manager-card-inactive", !question.active);
                activationButton.textContent = question.active ? "Deactivate" : "Reactivate";
                optionsPanel.hidden = !["singleSelect", "multiSelect"].includes(question.type);
                explanationPanel.hidden = question.type !== "yesNo";
                explanationLabelField.hidden = !question.requiresExplanationWhen;
                updateVersionState();
            };
            labelInput.addEventListener("input", () => {
                if (!question.persisted && !question.idManuallyEdited) {
                    idInput.value = createUniqueQuestionId(labelInput.value, question);
                }
            });
            idInput.addEventListener("input", () => {
                if (!question.persisted) question.idManuallyEdited = true;
            });
            card.querySelectorAll("input, select, textarea").forEach((control) => {
                control.addEventListener("input", syncQuestionFromCard);
                control.addEventListener("change", syncQuestionFromCard);
            });
            questionList.appendChild(card);
        });
        updateVersionState();
    };

    const validateQuestions = () => {
        const errors = [];
        const ids = new Set();
        questions.forEach((question, index) => {
            const name = question.label.trim() || `Question ${index + 1}`;
            if (!question.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.id)) errors.push(`${name} needs a valid stable ID.`);
            if (ids.has(question.id)) errors.push(`Question ID “${question.id}” is duplicated.`);
            if (!question.persisted && publishedQuestionIds.has(question.id)) errors.push(`Question ID “${question.id}” was used in a published version and cannot be reused for a new question.`);
            ids.add(question.id);
            if (!question.label.trim()) errors.push(`Question ${index + 1} needs a label.`);
            if (!APPLICATION_QUESTION_TYPES.has(question.type)) errors.push(`${name} has an unsupported type.`);
            if (typeof question.required !== "boolean" || typeof question.active !== "boolean") errors.push(`${name} has an invalid Required or Active value.`);
            if (!Number.isFinite(question.order) || !Number.isInteger(question.order) || question.order < 0) errors.push(`${name} needs a non-negative whole-number order.`);
            if (question.optionSource && question.optionSource !== "DOG_SPORT_OPTIONS") errors.push(`${name} uses an unknown options source.`);
            if (question.optionSource === "DOG_SPORT_OPTIONS" && question.type !== "multiSelect") errors.push(`${name} must remain a Multiple Select question.`);
            if (["singleSelect", "multiSelect"].includes(question.type) && !question.optionSource) {
                const optionIds = new Set();
                if (!question.options.length) errors.push(`${name} needs at least one option.`);
                question.options.forEach((option) => {
                    if (!option.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(option.id) || !option.label) errors.push(`${name} has an invalid option; use “stable-value | Display Label”.`);
                    if (optionIds.has(option.id)) errors.push(`${name} has duplicate option value “${option.id}”.`);
                    optionIds.add(option.id);
                });
            }
            if (question.requiresExplanationWhen && (question.type !== "yesNo" || !question.explanationLabel.trim())) errors.push(`${name} needs a valid Yes/No explanation label.`);
        });
        return [...new Set(errors)];
    };

    const createPreviewSection = (title) => {
        const section = document.createElement("section");
        section.className = "application-form-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.appendChild(heading);
        previewContent.appendChild(section);
        return section;
    };

    const appendPreviewField = (parent, labelText, type = "text", required = false) => {
        const field = document.createElement("div");
        field.className = "form-field";
        const label = document.createElement("label");
        label.textContent = `${labelText}${required ? " *" : ""}`;
        const control = type === "select" ? document.createElement("select") : document.createElement("input");
        if (type !== "select") control.type = type;
        control.disabled = true;
        if (type === "select") {
            const option = document.createElement("option");
            option.textContent = `Select ${labelText}`;
            control.appendChild(option);
        }
        label.appendChild(control);
        field.appendChild(label);
        parent.appendChild(field);
        return field;
    };

    const renderPreview = (
        previewQuestions = questions,
        title = `Preview — Proposed Version ${currentVersion + 1}`,
        historical = false
    ) => {
        document.getElementById("applicationQuestionsPreviewHeading").textContent = title;
        document.getElementById("applicationPreviewNotice").textContent = historical
            ? "Core application fields are system managed. This preview uses the immutable question snapshot from the selected published version."
            : "Core questions like name, address, and birthdate will display first followed by the below questions.";
        previewContent.replaceChildren();
        previewContent.className = "application-preview-content profile-form";

        const personal = createPreviewSection("Personal Information");
        const personalRowOne = document.createElement("div");
        personalRowOne.className = "form-row form-row-two-columns";
        appendPreviewField(personalRowOne, "First Name", "text", true);
        appendPreviewField(personalRowOne, "Last Name", "text", true);
        personal.appendChild(personalRowOne);
        const personalRowTwo = document.createElement("div");
        personalRowTwo.className = "form-row form-row-two-columns";
        appendPreviewField(personalRowTwo, "Preferred Name");
        appendPreviewField(personalRowTwo, "Email", "email", true);
        personal.appendChild(personalRowTwo);
        appendPreviewField(personal, "Phone", "tel", true);
        appendPreviewField(personal, "Date of Birth", "date");

        const address = createPreviewSection("Address");
        const addressRow = document.createElement("div");
        addressRow.className = "form-row form-row-two-columns";
        appendPreviewField(addressRow, "Country", "select", true);
        appendPreviewField(addressRow, "State / Province / Region", "select");
        address.appendChild(addressRow);
        appendPreviewField(address, "Street Address", "text", true);
        const cityRow = document.createElement("div");
        cityRow.className = "form-row form-row-two-columns";
        appendPreviewField(cityRow, "City", "text", true);
        appendPreviewField(cityRow, "ZIP / Postal Code", "text", true);
        address.appendChild(cityRow);

        const membership = createPreviewSection("Membership Type");
        const membershipCards = document.createElement("div");
        membershipCards.className = "membership-type-cards";
        Object.entries(previewMembershipConfig).forEach(([membershipType, configuration]) => {
            if (!configuration.active) return;
            const card = document.createElement("label");
            card.className = "membership-type-card";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "preview-membership-type";
            const content = document.createElement("span");
            const name = document.createElement("strong");
            name.textContent = configuration.displayName || membershipType;
            content.appendChild(name);
            if (typeof configuration.annualDues === "number") {
                const price = document.createElement("span");
                price.className = "membership-type-price";
                price.textContent = `$${configuration.annualDues.toLocaleString("en-US")}/year`;
                content.appendChild(price);
            }
            const description = document.createElement("span");
            description.textContent = configuration.description || "";
            content.appendChild(description);
            card.append(radio, content);
            membershipCards.appendChild(card);
        });
        membership.appendChild(membershipCards);

        const sponsor = createPreviewSection("Sponsor");
        const sponsorHelp = document.createElement("p");
        sponsorHelp.className = "field-help";
        sponsorHelp.textContent = "Select an eligible Active WBA member, or request help finding a sponsor.";
        sponsor.appendChild(sponsorHelp);
        const sponsorSearch = appendPreviewField(sponsor, "Search Current WBA Members", "search");
        sponsorSearch.querySelector("input").placeholder = "Search by member name";
        const sponsorRequest = document.createElement("label");
        sponsorRequest.className = "checkbox-option";
        const sponsorCheckbox = document.createElement("input");
        sponsorCheckbox.type = "checkbox";
        sponsorCheckbox.disabled = true;
        sponsorRequest.append(sponsorCheckbox, document.createTextNode(" I need help finding a sponsor."));
        sponsor.appendChild(sponsorRequest);

        const configurable = createPreviewSection("Additional Application Questions");
        const configurableQuestions = document.createElement("div");
        renderConfigurableApplicationQuestions(configurableQuestions, previewQuestions, "preview-question");
        configurable.appendChild(configurableQuestions);

        const agreements = createPreviewSection("Agreements");
        [
            "I have read and agree to the WBA Bylaws. *",
            "I have read and agree to the WBA Code of Ethics. *",
            "I agree to accept electronic communication as the official means for the Working Beauceron Association. *"
        ].forEach((text) => {
            const label = document.createElement("label");
            label.className = "checkbox-option";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.disabled = true;
            label.append(checkbox, document.createTextNode(` ${text}`));
            agreements.appendChild(label);
        });

        preview.showModal();
    };

    const formatVersionDate = (value) => {
        const date = value?.toDate ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime())
            ? "Date unavailable"
            : new Intl.DateTimeFormat("en-US", {year: "numeric", month: "long", day: "numeric"}).format(date);
    };

    const resolveVersionCreatorName = async (uid) => {
        if (!uid) return "Admin";
        try {
            const snapshot = await getDoc(doc(db, "users", uid));
            if (!snapshot.exists()) return "Admin";
            const data = snapshot.data();
            return `${data.preferredName || data.firstName || ""} ${data.lastName || ""}`.trim() || "Admin";
        } catch (error) {
            return "Admin";
        }
    };

    const openVersionDetail = (versionData) => {
        selectedHistoricalVersion = versionData;
        versionDetailHeading.textContent = `Version ${versionData.version}${versionData.version === currentVersion ? " — Current" : ""}`;
        versionDetailMetadata.textContent = `${formatVersionDate(versionData.createdAt)} — ${versionData.creatorName || "Admin"}${Number.isInteger(versionData.restoredFromVersion) ? ` · Restored from Version ${versionData.restoredFromVersion}` : ""}`;
        restoreVersionButton.hidden = versionData.version === currentVersion;
        restoreVersionButton.textContent = `Restore Version ${versionData.version}`;
        versionQuestionList.replaceChildren();
        normalizeApplicationQuestions(versionData.questions).forEach((question) => {
            const card = document.createElement("article");
            card.className = question.active ? "version-question-card" : "version-question-card question-manager-card-inactive";
            const heading = document.createElement("h3");
            heading.textContent = question.label;
            const metadata = document.createElement("p");
            metadata.className = "profile-muted";
            metadata.textContent = `${typeLabels[question.type]} · ${question.required ? "Required" : "Optional"} · ${question.active ? "Active" : "Inactive"} · Order ${question.order} · ID: ${question.id}`;
            card.append(heading, metadata);
            if (["singleSelect", "multiSelect"].includes(question.type)) {
                const options = document.createElement("p");
                options.textContent = question.optionSource === "DOG_SPORT_OPTIONS"
                    ? "Options Source: Dog Sports & Activities List (system managed)"
                    : `Options: ${getApplicationQuestionOptions(question).map((option) => `${option.label} (${option.id})`).join(", ")}`;
                card.appendChild(options);
            }
            if (question.requiresExplanationWhen) {
                const explanation = document.createElement("p");
                explanation.textContent = `Explanation when Yes: ${question.explanationLabel}`;
                card.appendChild(explanation);
            }
            versionQuestionList.appendChild(card);
        });
        versionDetailDialog.showModal();
    };

    const loadVersionHistory = async () => {
        const snapshot = await getDocs(collection(db, "membershipApplicationConfig", "current", "versions"));
        configurationVersions = await Promise.all(snapshot.docs.map(async (versionSnapshot) => {
            const data = versionSnapshot.data();
            return {...data, creatorName: await resolveVersionCreatorName(data.createdBy)};
        }));
        configurationVersions.sort((left, right) => right.version - left.version);
        publishedQuestionIds = new Set(configurationVersions.flatMap((versionData) =>
            Array.isArray(versionData.questions) ? versionData.questions.map((question) => question.id) : []
        ));
        versionHistoryList.replaceChildren();
        configurationVersions.forEach((versionData) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "version-history-item";
            const title = document.createElement("strong");
            title.textContent = `Version ${versionData.version}${versionData.version === currentVersion ? " — Current" : ""}`;
            const metadata = document.createElement("span");
            metadata.textContent = `${formatVersionDate(versionData.createdAt)} — ${versionData.creatorName || "Admin"}`;
            button.append(title, metadata);
            button.addEventListener("click", () => openVersionDetail(versionData));
            versionHistoryList.appendChild(button);
        });
    };

    const publishConfiguration = async (sourceQuestions, restoredFromVersion = null, skipConfirmation = false) => {
        const nextVersion = currentVersion + 1;
        const savedQuestions = serializeQuestionsForPublish(sourceQuestions);
        if (!skipConfirmation) {
            const confirmed = await requestPublishConfirmation(
                `Publish Membership Application Version ${nextVersion}?`,
                `You are about to publish Membership Application Version ${nextVersion}. These changes will affect new and editable applications. Previously submitted applications will retain the version and question snapshots they were submitted with.`,
                `Publish Version ${nextVersion}`
            );
            if (!confirmed) return false;
        }
        saveQuestionsButton.disabled = true;
        managerMessage.textContent = `Publishing Version ${nextVersion}...`;
        const now = new Date().toISOString();
        const versionData = {
            version: nextVersion,
            questions: savedQuestions,
            createdAt: now,
            createdBy: settingsAdmin.uid,
            ...(Number.isInteger(restoredFromVersion) ? {restoredFromVersion} : {})
        };
        try {
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplicationConfig", "current", "versions", String(nextVersion)), versionData);
            batch.set(doc(db, "membershipApplicationConfig", "current"), {
                currentVersion: nextVersion,
                updatedAt: now,
                updatedBy: settingsAdmin.uid
            });
            await batch.commit();
            currentVersion = nextVersion;
            liveQuestionsSnapshot = savedQuestions;
            questions = normalizeApplicationQuestions(savedQuestions).map((question) => ({...question, persisted: true}));
            usingDefaults = false;
            sourceMessage.textContent = "Core questions are not editable, if you need something changed please contact the app developer.";
            await loadVersionHistory();
            renderQuestionManager();
            managerMessage.textContent = `Version ${currentVersion} is now live.`;
            return true;
        } catch (error) {
            console.error("Application question version could not be published.", error);
            managerMessage.textContent = "We couldn't publish the new application version. No live configuration changes were applied.";
            updateVersionState();
            return false;
        }
    };

    const migrateLegacyConfiguration = async (currentData) => {
        const legacyQuestions = normalizeApplicationQuestions(currentData.questions);
        const createdAt = currentData.updatedAt || new Date().toISOString();
        const createdBy = settingsAdmin.uid;
        const versionData = {version: 1, questions: serializeQuestionsForPublish(legacyQuestions), createdAt, createdBy};
        const batch = writeBatch(db);
        batch.set(doc(db, "membershipApplicationConfig", "current", "versions", "1"), versionData);
        batch.set(doc(db, "membershipApplicationConfig", "current"), {currentVersion: 1, updatedAt: createdAt, updatedBy: createdBy});
        await batch.commit();
        return versionData;
    };

    createVersionOneButton.addEventListener("click", async () => {
        if (!legacyConfigurationData) return;
        const loadDebug = createLoadDebug(settingsAdminAuthorization || {});
        loadDebug.currentDocumentExists = true;
        loadDebug.currentVersion = 1;
        loadDebug.legacyQuestionsPresent = true;
        loadDebug.migrationNeeded = true;
        loadDebug.migrationAttempted = true;
        loadDebug.versionDocumentPath = "membershipApplicationConfig/current/versions/1";
        loadDebug.failureStage = "migrate-legacy-version-1";
        createVersionOneButton.disabled = true;
        managerMessage.textContent = "Creating Version 1...";
        try {
            await migrateLegacyConfiguration(legacyConfigurationData);
            loadDebug.migrationSucceeded = true;
            loadDebug.versionDocumentExists = true;
            currentVersion = 1;
            usingDefaults = false;
            legacyConfigurationData = null;
            createVersionOneButton.hidden = true;
            sourceMessage.textContent = "Core questions are not editable, if you need something changed please contact the app developer.";
            liveQuestionsSnapshot = serializeQuestionsForPublish(questions);
            if (currentVersion > 0) {
                loadDebug.failureStage = "list-historical-versions";
                loadDebug.historicalListAttempted = true;
                await loadVersionHistory();
            }
            loadDebug.failureStage = "render-editor";
            renderQuestionManager();
            loadDebug.failureStage = null;
            console.log("[Application Config Load Debug]", loadDebug);
            managerMessage.textContent = "Version 1 was created from the legacy configuration.";
        } catch (error) {
            console.error("[Application Config Load Debug]", loadDebug, error);
            managerMessage.textContent = "We couldn't create Version 1. The legacy configuration is unchanged and remains available in the editor.";
            createVersionOneButton.disabled = false;
        }
    });

    document.getElementById("addApplicationQuestionButton").addEventListener("click", () => {
        const question = {
            id: "",
            label: "",
            type: "shortText",
            required: false,
            active: true,
            order: questions.length ? Math.max(...questions.map((item) => item.order)) + 10 : 10,
            options: [],
            requiresExplanationWhen: false,
            explanationLabel: "Please explain.",
            persisted: false,
            idManuallyEdited: false
        };
        question.id = createUniqueQuestionId("New Question", question);
        questions.push(question);
        renderQuestionManager();
        questionList.lastElementChild?.querySelector('[data-question-field="label"]')?.focus();
    });

    document.getElementById("previewApplicationQuestionsButton").addEventListener("click", () => renderPreview());

    document.getElementById("closeApplicationQuestionsPreviewButton").addEventListener("click", () => {
        preview.close();
    });

    document.getElementById("cancelDeleteApplicationQuestionButton").addEventListener("click", () => {
        pendingDeleteQuestion = null;
        deleteDialog.close();
    });

    document.getElementById("confirmDeleteApplicationQuestionButton").addEventListener("click", () => {
        if (!pendingDeleteQuestion) return;
        const deletedLabel = pendingDeleteQuestion.label || pendingDeleteQuestion.id;
        questions = questions.filter((question) => question !== pendingDeleteQuestion);
        pendingDeleteQuestion = null;
        deleteDialog.close();
        renderQuestionManager();
        managerMessage.textContent = `“${deletedLabel}” was removed from the current configuration. Select Save Application Questions to publish this change.`;
    });

    deleteDialog.addEventListener("cancel", () => {
        pendingDeleteQuestion = null;
    });

    saveQuestionsButton.addEventListener("click", async () => {
        const errors = validateQuestions();
        if (errors.length) {
            managerMessage.textContent = errors.join(" ");
            return;
        }
        await publishConfiguration(questions);
    });

    document.getElementById("closeApplicationVersionDetailButton").addEventListener("click", () => versionDetailDialog.close());

    document.getElementById("cancelPublishApplicationVersionButton").addEventListener("click", () => {
        publishDialog.close();
        publishConfirmationResolver?.(false);
        publishConfirmationResolver = null;
    });

    confirmPublishButton.addEventListener("click", () => {
        publishDialog.close();
        publishConfirmationResolver?.(true);
        publishConfirmationResolver = null;
    });

    publishDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        publishDialog.close();
        publishConfirmationResolver?.(false);
        publishConfirmationResolver = null;
    });

    document.getElementById("previewHistoricalApplicationVersionButton").addEventListener("click", () => {
        if (!selectedHistoricalVersion) return;
        versionDetailDialog.close();
        renderPreview(
            normalizeApplicationQuestions(selectedHistoricalVersion.questions),
            `Preview — Version ${selectedHistoricalVersion.version}`,
            true
        );
    });

    restoreVersionButton.addEventListener("click", async () => {
        if (!selectedHistoricalVersion || selectedHistoricalVersion.version === currentVersion) return;
        const nextVersion = currentVersion + 1;
        const versionToRestore = selectedHistoricalVersion;
        versionDetailDialog.close();
        const confirmed = await requestPublishConfirmation(
            `Restore Version ${versionToRestore.version}?`,
            `Restoring Version ${versionToRestore.version} will create and publish a new Version ${nextVersion} using Version ${versionToRestore.version}'s question configuration. Existing historical versions will remain unchanged.${hasUnsavedChanges() ? " Any current unsaved editor changes will be discarded." : ""}`,
            `Restore as Version ${nextVersion}`
        );
        if (!confirmed) {
            openVersionDetail(versionToRestore);
            return;
        }
        await publishConfiguration(
            normalizeApplicationQuestions(versionToRestore.questions),
            versionToRestore.version,
            true
        );
    });

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) {
            window.location.replace("login.html");
            return;
        }
        let loadDebug = createLoadDebug();
        try {
            const authorization = await getAdminAuthorization(authenticatedUser);
            loadDebug = createLoadDebug(authorization);
            if (authorization.active !== true) {
                window.location.replace("dashboard.html");
                return;
            }
            settingsAdmin = authenticatedUser;
            settingsAdminAuthorization = authorization;
            loadDebug.failureStage = "read-current-pointer";
            const [snapshot, loadedMembershipConfig] = await Promise.all([
                getDoc(doc(db, "membershipApplicationConfig", "current")),
                loadMembershipConfig()
            ]);
            loadDebug.currentDocumentExists = snapshot.exists();
            previewMembershipConfig = loadedMembershipConfig;
            let liveQuestions;
            if (!snapshot.exists()) {
                usingDefaults = true;
                currentVersion = 0;
                loadDebug.currentVersion = 0;
                liveQuestions = normalizeApplicationQuestions();
                sourceMessage.textContent = "Currently using the default application configuration.";
            } else {
                loadDebug.failureStage = "detect-legacy-config";
                const currentData = snapshot.data();
                loadDebug.currentVersion = Number.isInteger(currentData.currentVersion)
                    ? currentData.currentVersion
                    : null;
                loadDebug.legacyQuestionsPresent = Array.isArray(currentData.questions);
                loadDebug.migrationNeeded = loadDebug.legacyQuestionsPresent
                    && !Number.isInteger(currentData.currentVersion);
                if (loadDebug.migrationNeeded) {
                    legacyConfigurationData = currentData;
                    currentVersion = 0;
                    liveQuestions = normalizeApplicationQuestions(currentData.questions);
                    sourceMessage.textContent = "Legacy configuration detected";
                    createVersionOneButton.hidden = false;
                } else {
                    currentVersion = currentData.currentVersion;
                    loadDebug.failureStage = "read-current-version";
                    loadDebug.versionDocumentPath = `membershipApplicationConfig/current/versions/${String(currentVersion)}`;
                    const versionSnapshot = await getDoc(doc(
                        db,
                        "membershipApplicationConfig",
                        "current",
                        "versions",
                        String(currentVersion)
                    ));
                    loadDebug.versionDocumentExists = versionSnapshot.exists();
                    if (!versionSnapshot.exists()) throw new Error("The current application version snapshot is missing.");
                    liveQuestions = normalizeApplicationQuestions(versionSnapshot.data().questions);
                    sourceMessage.textContent = "Core questions are not editable, if you need something changed please contact the app developer.";
                }
                usingDefaults = false;
            }
            questions = liveQuestions.map((question) => ({...question, persisted: true}));
            liveQuestionsSnapshot = currentVersion > 0 ? serializeQuestionsForPublish(questions) : [];
            if (currentVersion > 0) {
                loadDebug.failureStage = "list-historical-versions";
                loadDebug.historicalListAttempted = true;
                await loadVersionHistory();
            }
            if (currentVersion === 0) {
                liveQuestions.forEach((question) => publishedQuestionIds.add(question.id));
            }
            loadDebug.failureStage = "render-editor";
            renderQuestionManager();
            applicationQuestionsManager.hidden = false;
            accessMessage.textContent = "";
            loadDebug.failureStage = null;
            console.log("[Application Config Load Debug]", loadDebug);
        } catch (error) {
            console.error("[Application Config Load Debug]", loadDebug, error);
            accessMessage.textContent = "We couldn't load application question settings.";
        }
    });
}

// ------------------------------------
// Admin Dashboard
// ------------------------------------

const adminDashboard =
    document.getElementById(
        "adminDashboard"
    );


if (adminDashboard) {

    const adminAccessMessage =
        document.getElementById(
            "adminAccessMessage"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.replace(
                    "login.html"
                );

                return;

            }


            let authorization;
            let memberRecordExists = false;
            try {
                authorization = await getAdminAuthorization(authenticatedUser);
            } catch (error) {
                console.error("Admin authorization could not be verified.", error);
                redirectToPage("dashboard.html", "admin-authorization-read-failed", {
                    authenticatedUser,
                    authorization: {active: false, superAdmin: false},
                    memberRecordExists: false
                });
                return;
            }

            try {
                memberRecordExists = (
                    await getDoc(doc(db, "users", authenticatedUser.uid))
                ).exists();
            } catch (error) {
                console.warn("[Routing] Admin member-record diagnostic read failed.", error);
            }

            if (authorization.active !== true) {
                redirectToPage("dashboard.html", "inactive-or-missing-admin-authorization", {
                    authenticatedUser,
                    authorization,
                    memberRecordExists
                });
                return;
            }

            logRoutingDecision({
                authenticatedUser,
                authorization,
                memberRecordExists,
                decision: "allow-admin",
                reason: "active-admin-authorization"
            });
            adminDashboard.hidden = false;
            adminAccessMessage.textContent = "";
            const superAdminIndicator = document.getElementById("superAdminIndicator");
            if (superAdminIndicator) {
                superAdminIndicator.hidden = authorization.superAdmin !== true;
            }

            try {
                const [adminApplicationsData, adminMemberAccounts] = await Promise.all([
                    loadAdminApplications(),
                    loadAdminMemberAccounts()
                ]);
                const pendingCount = adminApplicationsData.filter(
                    (applicationData) => applicationData.applicationStatus === "Submitted"
                ).length;
                const awaitingBoardCount = adminApplicationsData.filter(
                    (applicationData) => applicationData.applicationStatus === "Awaiting Board Decision"
                ).length;
                const countElement = document.getElementById("adminPendingApplicationCount");
                if (countElement) {
                    countElement.textContent =
                        `${pendingCount} Pending Review · ${awaitingBoardCount} Awaiting Board`;
                }
                const duesAttentionCount = adminMemberAccounts.filter(
                    (memberData) => DUES_ATTENTION_STATUSES.has(memberData.membershipStatus)
                ).length;
                const duesCountElement = document.getElementById("adminDuesAttentionCount");
                if (duesCountElement) {
                    duesCountElement.textContent = duesAttentionCount === 0
                        ? "No accounts currently need dues attention."
                        : duesAttentionCount === 1
                            ? "1 account needs dues attention."
                            : `${duesAttentionCount} accounts need dues attention.`;
                    duesCountElement.classList.toggle(
                        "has-attention",
                        duesAttentionCount > 0
                    );
                }
            } catch (error) {
                console.error("Admin dashboard summary data could not be loaded.", error);
                adminAccessMessage.textContent =
                    "Admin access is active, but dashboard counts could not be loaded. You can still use the Admin tools below.";
            }

        }
    );

}


// ------------------------------------
// Admin Application Review
// ------------------------------------

const formatApplicationDate = (value) => {
    if (!value) return "—";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime())
        ? String(value)
        : new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        }).format(date);
};

const getApplicationMembershipYear = (applicationData) => {
    if (Number.isInteger(applicationData?.membershipYear)) {
        return applicationData.membershipYear;
    }
    const submittedDate = new Date(applicationData?.submittedAt || "");
    return Number.isNaN(submittedDate.getTime())
        ? null
        : submittedDate.getFullYear();
};

const getApplicationApplicantName = (applicationData) => {
    const givenName = String(
        applicationData?.preferredName || applicationData?.firstName || ""
    ).trim();
    const lastName = String(applicationData?.lastName || "").trim();
    return [givenName, lastName].filter(Boolean).join(" ") || "Applicant";
};

const getSponsorReviewState = (applicationData, memberAccountsByUid) => {
    if (applicationData?.sponsorRequested === true) {
        return {
            code: "request",
            label: "Needs Sponsor",
            reason: "The applicant requested help finding a sponsor."
        };
    }

    const sponsorUid = applicationData?.sponsorUserId;
    if (typeof sponsorUid !== "string") {
        return {
            code: "malformed",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor reference is missing or malformed."
        };
    }
    if (sponsorUid === applicationData?.applicantUid) {
        return {
            code: "self",
            label: "Sponsor Needs Review",
            reason: "The applicant appears to reference their own account as sponsor."
        };
    }

    const sponsor = memberAccountsByUid.get(sponsorUid);
    if (!sponsor) {
        return {
            code: "missing",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor could not be verified as a current WBA member."
        };
    }
    if (sponsor.membershipStatus !== "Active") {
        return {
            code: "inactive",
            label: "Sponsor Needs Review",
            reason: "The selected sponsor is no longer an Active WBA member."
        };
    }

    return { code: "valid", label: "Valid Sponsor", reason: "" };
};

const adminApplications = document.getElementById("adminApplications");

if (adminApplications) {
    const accessMessage = document.getElementById("adminApplicationsAccessMessage");
    const list = document.getElementById("adminApplicationList");
    const message = document.getElementById("adminApplicationsMessage");
    const filter = document.getElementById("applicationStatusFilter");
    let loadedApplications = [];
    let memberAccountsByUid = new Map();

    const renderApplications = () => {
        const selectedStatus = filter.value;
        const filtered = loadedApplications
            .filter((applicationData) => selectedStatus === "Reviewed"
                ? ["Approved", "Declined"].includes(applicationData.applicationStatus)
                : applicationData.applicationStatus === selectedStatus)
            .sort((first, second) => {
                const firstTime = Date.parse(first.submittedAt || "") || 0;
                const secondTime = Date.parse(second.submittedAt || "") || 0;
                return firstTime - secondTime;
            });

        list.replaceChildren();
        filtered.forEach((applicationData) => {
            const sponsorReview = getSponsorReviewState(
                applicationData,
                memberAccountsByUid
            );
            const card = document.createElement("article");
            card.className = "admin-application-card";
            const heading = document.createElement("h3");
            heading.textContent = getApplicationApplicantName(applicationData);
            const details = document.createElement("dl");
            const rows = [
                ["Membership Type", applicationData.membershipType || "—"],
                ["Membership Year", getApplicationMembershipYear(applicationData) || "—"],
                ["Submitted", formatApplicationDate(applicationData.submittedAt)],
                ["Sponsor", applicationData.sponsorRequested === true
                    ? "Needs Sponsor"
                    : applicationData.sponsorDisplayName
                        ? `Sponsored by ${applicationData.sponsorDisplayName}`
                        : "Sponsor not recorded"],
                ["Sponsorship Review", sponsorReview.label],
                ["Status", applicationData.applicationStatus === "Needs Revision"
                    ? "Needs Applicant Revision"
                    : applicationData.applicationStatus]
            ];
            rows.forEach(([term, value]) => {
                const dt = document.createElement("dt");
                const dd = document.createElement("dd");
                dt.textContent = term;
                dd.textContent = String(value);
                details.append(dt, dd);
            });
            if (sponsorReview.code !== "valid") card.classList.add("needs-sponsor");
            const link = document.createElement("a");
            link.href = `admin-application.html?id=${encodeURIComponent(applicationData.applicantUid)}`;
            link.textContent = "View Application";
            link.className = "admin-manage-link";
            card.append(heading, details, link);
            list.appendChild(card);
        });
        message.textContent = filtered.length
            ? `${filtered.length} application${filtered.length === 1 ? "" : "s"}.`
            : "No applications match this status.";
    };

    filter.addEventListener("change", renderApplications);
    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) {
            window.location.replace("login.html");
            return;
        }
        try {
            if (!await isAuthorizedAdmin(authenticatedUser)) {
                window.location.replace("dashboard.html");
                return;
            }
            const [applications, memberAccounts] = await Promise.all([
                loadAdminApplications(),
                loadAdminMemberAccounts()
            ]);
            memberAccountsByUid = new Map(
                memberAccounts.map((memberData) => [memberData.uid, memberData])
            );
            loadedApplications = applications
                .filter((applicationData) =>
                    ["Submitted", "Needs Revision", "Awaiting Board Decision", "Approved", "Declined"].includes(applicationData.applicationStatus)
                );
            renderApplications();
            adminApplications.hidden = false;
            accessMessage.textContent = "";
        } catch (error) {
            console.error("Admin applications could not be loaded.", error);
            accessMessage.textContent = "We couldn't load the applications.";
        }
    });
}

const adminApplicationDetail = document.getElementById("adminApplicationDetail");

if (adminApplicationDetail) {
    const accessMessage = document.getElementById("adminApplicationAccessMessage");
    const sections = document.getElementById("adminApplicationSections");
    const reviewFlag = document.getElementById("adminApplicationReviewFlag");
    const sponsorPanel = document.getElementById("adminSponsorAssignment");
    const sponsorSearch = document.getElementById("adminSponsorSearch");
    const sponsorResults = document.getElementById("adminSponsorResults");
    const actions = document.getElementById("adminReviewActions");
    const sendToBoardReviewButton = document.getElementById("sendToBoardReviewButton");
    const sendBackForRevisionButton = document.getElementById("sendBackForRevisionButton");
    const revisionRequestPanel = document.getElementById("adminRevisionRequestPanel");
    const revisionRequestMessage = document.getElementById("adminRevisionRequestMessage");
    const boardDecisionControls = document.getElementById("boardDecisionControls");
    const decisionHelp = document.getElementById("adminDecisionHelp");
    const message = document.getElementById("adminApplicationMessage");
    const downloadApplicationPdfButton = document.getElementById("adminDownloadApplicationPdfButton");
    const applicationPdfMessage = document.getElementById("adminApplicationPdfMessage");
    const applicantUid = new URLSearchParams(window.location.search).get("id")?.trim() || "";
    let applicationData = null;
    let applicantData = null;
    let activeSponsors = [];
    let memberAccountsByUid = new Map();
    let adminUser = null;

    downloadApplicationPdfButton.addEventListener("click", async () => {
        if (!applicationData || !canDownloadMembershipApplicationPdf(applicationData)) return;
        downloadApplicationPdfButton.disabled = true;
        applicationPdfMessage.textContent = "Preparing application PDF...";
        try {
            const questionRows = getApplicationQuestionResponses(applicationData).map((response) => [
                response.questionLabel || response.questionId,
                formatApplicationQuestionAnswer(response)
            ]);
            await generateMembershipApplicationPdf(
                applicationData,
                questionRows
            );
            applicationPdfMessage.textContent = "The application PDF has been downloaded.";
        } catch (error) {
            console.error("Admin application PDF could not be generated.", error);
            applicationPdfMessage.textContent = error.message || "We couldn't create the application PDF. Please try again.";
        } finally {
            downloadApplicationPdfButton.disabled = false;
        }
    });

    const yesNo = (value) => value === true ? "Yes" : value === false ? "No" : "—";
    const renderSection = (title, rows) => {
        const section = document.createElement("section");
        section.className = "admin-application-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const details = document.createElement("dl");
        rows.filter(([, value]) => value !== undefined).forEach(([label, value]) => {
            const dt = document.createElement("dt");
            const dd = document.createElement("dd");
            dt.textContent = label;
            dd.textContent = value === "" || value === null ? "—" : String(value);
            details.append(dt, dd);
        });
        section.append(heading, details);
        sections.appendChild(section);
    };

    const renderApplication = () => {
        sections.replaceChildren();
        const membershipYear = getApplicationMembershipYear(applicationData);
        const juniorAge = applicationData.membershipType === "Junior" && membershipYear
            ? getAgeOnJanuaryFirst(applicationData.dateOfBirth, membershipYear)
            : null;
        const questionResponses = getApplicationQuestionResponses(applicationData);
        document.getElementById("adminApplicationApplicantName").textContent =
            getApplicationApplicantName(applicationData);
        downloadApplicationPdfButton.hidden = !canDownloadMembershipApplicationPdf(applicationData);
        renderSection("Application Information", [
            ["Application Status", applicationData.applicationStatus === "Needs Revision"
                ? "Waiting for Applicant Revision"
                : applicationData.applicationStatus],
            ["Submitted Date", formatApplicationDate(applicationData.submittedAt)],
            ["Sent to Board", applicationData.adminReviewedAt ? formatApplicationDate(applicationData.adminReviewedAt) : undefined],
            ["Reviewed Date", applicationData.reviewedAt ? formatApplicationDate(applicationData.reviewedAt) : undefined],
            ["Decline Reason (Admin-only)", applicationData.applicationStatus === "Declined" ? applicationData.declineReason : undefined],
            ["Revision Request", applicationData.applicationStatus === "Needs Revision" ? applicationData.revisionRequestMessage : undefined],
            ["Membership Year", membershipYear || "—"],
            ["Application Form Version", Number.isInteger(applicationData.applicationVersion) && applicationData.applicationVersion > 0
                ? applicationData.applicationVersion
                : applicationData.applicationVersion === 0
                    ? "Default / Unversioned"
                    : "Legacy / Not Recorded"],
            ["Membership Type", applicationData.membershipType],
            ["Dues Amount at Submission", typeof applicationData.membershipDuesAmount === "number" ? `$${applicationData.membershipDuesAmount}` : "—"],
            ...(applicationData.membershipType === "Junior" ? [
                ["Age on January 1", juniorAge ?? "Unable to calculate"],
                ["Junior Eligibility", juniorAge !== null && juniorAge >= 10 && juniorAge <= 18 ? "Eligible" : "Not eligible"]
            ] : []),
            ["Residence Classification", ["US", "CA"].includes(applicationData.countryCode) ? "United States / Canada" : "Foreign"]
        ]);
        renderSection("Personal Information", [["First Name", applicationData.firstName], ["Last Name", applicationData.lastName], ["Preferred Name", applicationData.preferredName], ["Email", applicationData.email], ["Phone", applicationData.phone], ["Date of Birth", applicationData.dateOfBirth]]);
        renderSection("Address", [["Country", applicationData.countryName || applicationData.country], ["State / Province / Region", applicationData.subdivisionName || applicationData.state], ["Street Address", applicationData.address], ["City", applicationData.city], ["ZIP / Postal Code", applicationData.zip]]);
        renderSection("Sponsor", [["Sponsor Status", applicationData.sponsorRequested === true ? "Sponsor Request Pending" : applicationData.sponsorDisplayName ? `Sponsored by ${applicationData.sponsorDisplayName}` : "No sponsor recorded"], ["Assigned At", formatApplicationDate(applicationData.sponsorAssignedAt)]]);
        renderSection("Agreements", [["Bylaws Accepted", yesNo(applicationData.bylawsAccepted)], ["Code of Ethics Accepted", yesNo(applicationData.codeOfEthicsAccepted)], ["Communications Consent", yesNo(applicationData.communicationsConsent)]]);
        renderSection(
            "Additional Application Questions",
            questionResponses.map((response) => [
                response.questionLabel || response.questionId,
                formatApplicationQuestionAnswer(response)
            ])
        );

        const isSubmitted = applicationData.applicationStatus === "Submitted";
        const isNeedsRevision = applicationData.applicationStatus === "Needs Revision";
        const isAwaitingBoard = applicationData.applicationStatus === "Awaiting Board Decision";
        const sponsorReview = getSponsorReviewState(
            applicationData,
            memberAccountsByUid
        );
        const sponsorNeedsResolution = sponsorReview.code !== "valid";
        reviewFlag.hidden = !sponsorNeedsResolution;
        reviewFlag.textContent = sponsorNeedsResolution
            ? `${sponsorReview.label}: ${sponsorReview.reason}`
            : "";
        sponsorPanel.hidden = !(isSubmitted || isAwaitingBoard) || !sponsorNeedsResolution;
        actions.hidden = false;
        sendToBoardReviewButton.hidden = !isSubmitted;
        sendBackForRevisionButton.hidden = !isSubmitted;
        revisionRequestPanel.hidden = true;
        revisionRequestMessage.value = "";
        boardDecisionControls.hidden = !isAwaitingBoard;
        decisionHelp.textContent = isSubmitted
            ? "Confirm the application is complete and ready before sending it to the Board."
            : isAwaitingBoard
                ? "Record the Board's final decision after it has been made outside the portal."
                : isNeedsRevision
                    ? "Waiting for Applicant Revision."
                    : "Download the frozen application record as a PDF.";
    };

    const validateApplicationReadiness = async () => {
        if (applicationData.sponsorRequested || !applicationData.sponsorUserId) return "Assign an Active WBA sponsor before continuing this application.";
        if (applicationData.sponsorUserId === applicantUid) {
            return "The applicant appears to reference their own account as sponsor. Please assign another sponsor before sending this application to the Board.";
        }
        const sponsorSnapshot = await getDoc(doc(db, "users", applicationData.sponsorUserId));
        if (!sponsorSnapshot.exists()) {
            return "The selected sponsor could not be verified as a current WBA member. Please assign another sponsor before sending this application to the Board.";
        }
        if (sponsorSnapshot.data().membershipStatus !== "Active") {
            return "The selected sponsor is no longer an Active WBA member. Please assign another sponsor before sending this application to the Board.";
        }
        const membershipYear = getApplicationMembershipYear(applicationData);
        if (applicationData.membershipType === "Junior") {
            if (!membershipYear || !isJuniorEligible(applicationData.dateOfBirth, membershipYear)) {
                return "This applicant does not meet Junior eligibility for the application membership year.";
            }
        }
        const isForeign = !["US", "CA"].includes(applicationData.countryCode);
        if ((applicationData.membershipType === "Foreign") !== isForeign) {
            return "The membership type does not match the applicant's country classification.";
        }
        const required = ["firstName", "lastName", "email", "phone", "address", "city", "zip", "countryCode", "membershipType"];
        const questionResponses = getApplicationQuestionResponses(applicationData);
        const hasMalformedQuestionResponse = Array.isArray(applicationData.customQuestionResponses) &&
            applicationData.customQuestionResponses.some(
                (response) => !hasValidApplicationQuestionResponseShape(response)
            );
        const hasMissingRequiredQuestion = questionResponses
            .some((response) => !hasValidRequiredQuestionAnswer(response));
        const hasMissingRequiredExplanation = questionResponses.some(
            (response) => response.requiresExplanationWhen === true &&
                response.answer === true &&
                (!response.explanation || !response.explanation.trim())
        );
        if (required.some((field) => !applicationData[field]) || hasMalformedQuestionResponse || hasMissingRequiredQuestion || hasMissingRequiredExplanation || applicationData.bylawsAccepted !== true || applicationData.codeOfEthicsAccepted !== true || applicationData.communicationsConsent !== true) {
            return "This application is missing required submitted information and cannot continue.";
        }
        return "";
    };

    sponsorSearch.addEventListener("input", () => {
        const term = sponsorSearch.value.trim().toLocaleLowerCase();
        sponsorResults.replaceChildren();
        if (!term) return;
        activeSponsors.filter((sponsor) => sponsor.uid !== applicantUid)
            .filter((sponsor) => [sponsor.firstName, sponsor.lastName, sponsor.preferredName, sponsor.email].some((value) => String(value || "").toLocaleLowerCase().includes(term)))
            .slice(0, 8)
            .forEach((sponsor) => {
                const button = document.createElement("button");
                const sponsorName = `${sponsor.preferredName || sponsor.firstName || ""} ${sponsor.lastName || ""}`.trim() || sponsor.email;
                button.type = "button";
                button.textContent = sponsorName;
                button.addEventListener("click", async () => {
                    message.textContent = "Assigning sponsor...";
                    try {
                        const [refreshedSponsor, refreshedApplication] = await Promise.all([
                            getDoc(doc(db, "users", sponsor.uid)),
                            getDoc(doc(db, "membershipApplications", applicantUid))
                        ]);
                        if (!refreshedSponsor.exists() || refreshedSponsor.data().membershipStatus !== "Active") throw new Error("Sponsor is no longer Active.");
                        if (!refreshedApplication.exists() || !["Submitted", "Awaiting Board Decision"].includes(refreshedApplication.data().applicationStatus)) throw new Error("Application is no longer open for sponsor assignment.");
                        applicationData = {applicantUid, ...refreshedApplication.data()};
                        const assignedAt = new Date().toISOString();
                        const previousSponsorUserId = applicationData.sponsorUserId || null;
                        const batch = writeBatch(db);
                        batch.set(doc(db, "membershipApplications", applicantUid), {
                            sponsorUserId: sponsor.uid,
                            sponsorDisplayName: sponsorName,
                            sponsorRequested: false,
                            sponsorAssignedAt: assignedAt,
                            sponsorAssignedBy: adminUser.uid
                        }, { merge: true });
                        batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                            memberUid: applicantUid,
                            action: "APPLICATION_SPONSOR_ASSIGNED",
                            category: "application",
                            performedBy: adminUser.uid,
                            field: "sponsorUserId",
                            oldValue: previousSponsorUserId,
                            newValue: sponsor.uid,
                            source: "Admin Application Review"
                        }));
                        await batch.commit();
                        applicationData = { ...applicationData, sponsorUserId: sponsor.uid, sponsorDisplayName: sponsorName, sponsorRequested: false, sponsorAssignedAt: assignedAt, sponsorAssignedBy: adminUser.uid };
                        sponsorResults.replaceChildren();
                        sponsorSearch.value = "";
                        renderApplication();
                        message.textContent = "Sponsor assigned successfully.";
                    } catch (error) {
                        console.error("Sponsor could not be assigned.", error);
                        message.textContent = "The sponsor could not be assigned. Confirm the member is still Active and try again.";
                    }
                });
                sponsorResults.appendChild(button);
            });
    });

    sendToBoardReviewButton.addEventListener("click", async () => {
        message.textContent = "Validating application...";
        try {
            if (applicationData.applicationStatus !== "Submitted") {
                message.textContent = "Only Submitted applications can be sent to Board review.";
                return;
            }
            const validationMessage = await validateApplicationReadiness();
            if (validationMessage) { message.textContent = validationMessage; return; }
            if (!window.confirm("Send this completed application to Board review?")) { message.textContent = ""; return; }
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            if (!refreshedApplication.exists()) throw new Error("Application no longer exists.");
            applicationData = { applicantUid, ...refreshedApplication.data() };
            if (applicationData.applicationStatus !== "Submitted") {
                renderApplication();
                message.textContent = "This application is no longer awaiting initial review.";
                return;
            }
            const finalValidationMessage = await validateApplicationReadiness();
            if (finalValidationMessage) { message.textContent = finalValidationMessage; renderApplication(); return; }
            const adminReviewedAt = new Date().toISOString();
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), {
                applicationStatus: "Awaiting Board Decision",
                adminReviewedAt,
                adminReviewedBy: adminUser.uid
            }, { merge: true });
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_SENT_TO_BOARD",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Submitted",
                newValue: "Awaiting Board Decision",
                source: "Admin Application Review"
            }));
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Awaiting Board Decision", adminReviewedAt, adminReviewedBy: adminUser.uid };
            renderApplication();
            message.textContent = "Application sent to Board review. The applicant remains a non-active applicant.";
        } catch (error) {
            console.error("Application could not be sent to Board review.", error);
            message.textContent = "We couldn't send this application to Board review.";
        }
    });

    sendBackForRevisionButton.addEventListener("click", async () => {
        if (applicationData.applicationStatus !== "Submitted") {
            message.textContent = "Only Submitted applications can be sent back to the applicant.";
            return;
        }
        if (revisionRequestPanel.hidden) {
            revisionRequestPanel.hidden = false;
            revisionRequestMessage.focus();
            message.textContent = "Enter the changes the applicant needs to make, then select Send Back to Applicant again.";
            return;
        }
        const requestedRevision = revisionRequestMessage.value.trim();
        if (!requestedRevision) {
            message.textContent = "Enter a message explaining what the applicant needs to correct or clarify.";
            revisionRequestMessage.focus();
            return;
        }
        try {
            const applicationRef = doc(db, "membershipApplications", applicantUid);
            const refreshedApplication = await getDoc(applicationRef);
            if (!refreshedApplication.exists() || refreshedApplication.data().applicationStatus !== "Submitted") {
                if (refreshedApplication.exists()) {
                    applicationData = { applicantUid, ...refreshedApplication.data() };
                    renderApplication();
                }
                message.textContent = "This application is no longer awaiting initial review.";
                return;
            }
            const revisionRequestedAt = new Date().toISOString();
            const batch = writeBatch(db);
            batch.set(applicationRef, {
                applicationStatus: "Needs Revision",
                revisionRequestMessage: requestedRevision,
                revisionRequestedAt,
                revisionRequestedBy: adminUser.uid
            }, { merge: true });
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_REVISION_REQUESTED",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Submitted",
                newValue: "Needs Revision",
                source: "Admin Application Review",
                note: "Application returned to applicant for revision."
            }));
            await batch.commit();
            applicationData = {
                ...applicationData,
                applicationStatus: "Needs Revision",
                revisionRequestMessage: requestedRevision,
                revisionRequestedAt,
                revisionRequestedBy: adminUser.uid
            };
            renderApplication();
            message.textContent = "Application sent back to the applicant for revision.";
        } catch (error) {
            console.error("Application revision request failed.", error);
            message.textContent = "We couldn't send this application back to the applicant.";
        }
    });

    document.getElementById("recordBoardApprovalButton").addEventListener("click", async () => {
        message.textContent = "Validating application...";
        try {
            if (applicationData.applicationStatus !== "Awaiting Board Decision") {
                message.textContent = "Only applications awaiting a Board decision can receive final approval.";
                return;
            }
            const validationMessage = await validateApplicationReadiness();
            if (validationMessage) { message.textContent = validationMessage; return; }
            if (!window.confirm("The Board has approved this application. Record approval and move the applicant to Pending Dues?")) { message.textContent = ""; return; }
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            applicationData = { applicantUid, ...refreshedApplication.data() };
            if (applicationData.applicationStatus !== "Awaiting Board Decision") {
                renderApplication();
                message.textContent = "This application is no longer awaiting a Board decision.";
                return;
            }
            const finalValidationMessage = await validateApplicationReadiness();
            if (finalValidationMessage) { message.textContent = finalValidationMessage; renderApplication(); return; }
            const [refreshedApplicant, refreshedMemberProfile, viewerAuthorization] = await Promise.all([
                getDoc(doc(db, "users", applicantUid)),
                getDoc(doc(db, "memberProfiles", applicantUid)),
                getAdminAuthorization(adminUser)
            ]);
            applicantData = refreshedApplicant.exists() ? refreshedApplicant.data() : {};
            const reviewedAt = new Date().toISOString();
            const applicationWrite = {
                applicationStatus: "Approved",
                reviewedAt,
                reviewedBy: adminUser.uid
            };
            const applicantIdentityUpdate = {
                firstName: applicationData.firstName || "",
                lastName: applicationData.lastName || "",
                preferredName: applicationData.preferredName || "",
                email: applicationData.email || applicantData.email || ""
            };
            const updatedUserData = {
                ...applicantData,
                ...(!refreshedApplicant.exists() ? applicantIdentityUpdate : {}),
                membershipStatus: "Pending Dues",
                membershipUpdatedAt: reviewedAt,
                membershipUpdatedBy: adminUser.uid
            };
            const userWrite = {
                ...applicantIdentityUpdate,
                membershipStatus: "Pending Dues",
                membershipUpdatedAt: reviewedAt,
                membershipUpdatedBy: adminUser.uid
            };
            const fullProfileWrite = buildMemberProfileData(applicantUid, updatedUserData);
            const profileWrite = refreshedMemberProfile.exists()
                ? {
                    membershipStatus: fullProfileWrite.membershipStatus,
                    sponsorEligible: fullProfileWrite.sponsorEligible,
                    memberId: fullProfileWrite.memberId || deleteField(),
                    membershipType: fullProfileWrite.membershipType || deleteField(),
                    membershipStartDate: fullProfileWrite.membershipStartDate || deleteField(),
                    membershipCurrentThrough: fullProfileWrite.membershipCurrentThrough || deleteField()
                }
                : fullProfileWrite;
            const historyActionTypes = ["APPLICATION_APPROVED"];
            if ((applicantData.membershipStatus || null) !== "Pending Dues") {
                historyActionTypes.push("MEMBERSHIP_STATUS_CHANGED");
            }
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), applicationWrite, { merge: true });
            batch.set(doc(db, "users", applicantUid), userWrite, { merge: true });
            if (refreshedMemberProfile.exists()) {
                batch.set(doc(db, "memberProfiles", applicantUid), profileWrite, { merge: true });
            } else {
                batch.set(doc(db, "memberProfiles", applicantUid), profileWrite);
            }
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_APPROVED",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Awaiting Board Decision",
                newValue: "Approved",
                source: "Admin Application Review"
            }));
            if ((applicantData.membershipStatus || null) !== "Pending Dues") {
                batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                    memberUid: applicantUid,
                    action: "MEMBERSHIP_STATUS_CHANGED",
                    category: "membership",
                    performedBy: adminUser.uid,
                    field: "membershipStatus",
                    oldValue: applicantData.membershipStatus || null,
                    newValue: "Pending Dues",
                    source: "Admin Application Review"
                }));
            }
            console.log("[Application Approval Debug]", {
                applicantUid,
                applicationStatusBefore: applicationData.applicationStatus,
                userDocumentExists: refreshedApplicant.exists(),
                memberProfileExists: refreshedMemberProfile.exists(),
                writesIncluded: [
                    "membershipApplications",
                    "users",
                    "memberProfiles",
                    ...historyActionTypes.map(() => "memberHistory")
                ],
                applicationWriteKeys: Object.keys(applicationWrite),
                userWriteKeys: Object.keys(userWrite),
                profileWriteKeys: Object.keys(profileWrite),
                historyActionTypes,
                sponsorRequested: applicationData.sponsorRequested === true,
                sponsorValidationPassed: true,
                viewerAdmin: viewerAuthorization.active === true,
                viewerSuperAdmin: viewerAuthorization.superAdmin === true
            });
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Approved", reviewedAt, reviewedBy: adminUser.uid };
            applicantData = updatedUserData;
            renderApplication();
            message.textContent = "Application approved. Membership status is now Pending Dues.";
        } catch (error) {
            console.error("Application approval failed.", error);
            message.textContent = "We couldn't approve this application. No approval changes were applied.";
        }
    });

    document.getElementById("recordBoardDeclineButton").addEventListener("click", async () => {
        if (applicationData.applicationStatus !== "Awaiting Board Decision") {
            message.textContent = "Only applications awaiting a Board decision can be declined.";
            return;
        }
        const declineReason = document.getElementById("adminDeclineReason").value.trim();
        if (!declineReason) { message.textContent = "Enter an Admin-only decline reason before declining."; return; }
        if (!window.confirm("The Board did not approve this application. Record the application as declined?")) return;
        try {
            const refreshedApplication = await getDoc(doc(db, "membershipApplications", applicantUid));
            if (!refreshedApplication.exists() || refreshedApplication.data().applicationStatus !== "Awaiting Board Decision") {
                if (refreshedApplication.exists()) applicationData = { applicantUid, ...refreshedApplication.data() };
                renderApplication();
                message.textContent = "This application is no longer awaiting a Board decision.";
                return;
            }
            const reviewedAt = new Date().toISOString();
            const batch = writeBatch(db);
            batch.set(doc(db, "membershipApplications", applicantUid), { applicationStatus: "Declined", reviewedAt, reviewedBy: adminUser.uid, declineReason }, { merge: true });
            batch.set(createMemberHistoryRef(applicantUid), buildMemberHistoryEntry({
                memberUid: applicantUid,
                action: "APPLICATION_DECLINED",
                category: "application",
                performedBy: adminUser.uid,
                field: "applicationStatus",
                oldValue: "Awaiting Board Decision",
                newValue: "Declined",
                source: "Admin Application Review",
                note: "See application review record."
            }));
            await batch.commit();
            applicationData = { ...applicationData, applicationStatus: "Declined", reviewedAt, reviewedBy: adminUser.uid, declineReason };
            renderApplication();
            message.textContent = "Application declined. The applicant's membership status was not changed.";
        } catch (error) {
            console.error("Application decline failed.", error);
            message.textContent = "We couldn't decline this application.";
        }
    });

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser?.emailVerified) { window.location.replace("login.html"); return; }
        try {
            if (!await isAuthorizedAdmin(authenticatedUser)) { window.location.replace("dashboard.html"); return; }
            if (!applicantUid) { accessMessage.textContent = "No application was selected."; return; }
            adminUser = authenticatedUser;
            const [applicationSnapshot, applicantSnapshot, adminMemberAccounts] = await Promise.all([
                getDoc(doc(db, "membershipApplications", applicantUid)),
                getDoc(doc(db, "users", applicantUid)),
                loadAdminMemberAccounts()
            ]);
            console.log("[Admin Application Load Debug]", {
                applicationExists: applicationSnapshot.exists(),
                applicantUserRecordExists: applicantSnapshot.exists(),
                applicationStatus: applicationSnapshot.exists()
                    ? applicationSnapshot.data().applicationStatus || null
                    : null,
                selectedRenderSource: applicationSnapshot.exists()
                    ? "application-snapshot"
                    : "none"
            });
            if (!applicationSnapshot.exists() || !["Submitted", "Needs Revision", "Awaiting Board Decision", "Approved", "Declined"].includes(applicationSnapshot.data().applicationStatus)) {
                accessMessage.textContent = "The membership application could not be found.";
                return;
            }
            applicationData = { applicantUid, ...applicationSnapshot.data() };
            applicantData = applicantSnapshot.exists() ? applicantSnapshot.data() : {};
            memberAccountsByUid = new Map(
                adminMemberAccounts.map((memberData) => [memberData.uid, memberData])
            );
            activeSponsors = adminMemberAccounts.filter(
                (userData) => userData.membershipStatus === "Active"
            );
            renderApplication();
            adminApplicationDetail.hidden = false;
            accessMessage.textContent = "";
        } catch (error) {
            console.error("Admin application detail could not be loaded.", error);
            accessMessage.textContent = "We couldn't load this application.";
        }
    });
}


// ------------------------------------
// Admin Membership
// ------------------------------------

const adminMemberDirectory =
    document.getElementById(
        "adminMemberDirectory"
    );


if (adminMemberDirectory) {

    const adminMemberSearchInput =
        document.getElementById(
            "adminMemberSearchInput"
        );

    const adminMemberTableBody =
        document.getElementById(
            "adminMemberTableBody"
        );

    const adminMemberMessage =
        document.getElementById(
            "adminMemberMessage"
        );

    const adminMemberAccessMessage =
        document.getElementById(
            "adminMemberAccessMessage"
        );

    const adminMemberFilter =
        document.getElementById("adminMemberFilter");

    const adminSortButtons =
        Array.from(document.querySelectorAll("[data-admin-sort]"));

    let adminMembers = [];
    let adminMemberSort = { field: "member", direction: "ascending" };
    const adminMembershipDebug = {
        currentUid: null,
        emailVerified: false,
        adminActive: false,
        superAdmin: false,
        currentUserDocumentExists: false,
        collectionQueryStarted: false,
        collectionQuerySucceeded: false,
        documentsReturned: 0,
        recordsAfterFiltering: 0,
        recordsAfterSearch: 0,
        recordsAfterDuesFilter: 0,
        recordsRendered: 0
    };

    const logAdminMembershipDebug = (updates = {}) => {
        Object.assign(adminMembershipDebug, updates);
        console.log("[Admin Membership Debug]", {...adminMembershipDebug});
    };

    const naturalAdminCollator = new Intl.Collator(undefined, {
        sensitivity: "base",
        numeric: true
    });


    const formatAdminMembershipDate =
        (value) => {

            if (!value) {
                return "—";
            }


            const date =
                typeof value.toDate === "function"
                    ? value.toDate()
                    : new Date(value);


            if (Number.isNaN(date.getTime())) {
                return String(value);
            }


            return new Intl.DateTimeFormat(
                undefined,
                {
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                }
            ).format(date);

        };


    const getAdminMemberName =
        (memberData) => {

            const preferredName = String(memberData.preferredName || "").trim();
            const firstName = String(memberData.firstName || "").trim();
            const lastName = String(memberData.lastName || "").trim();
            const fullName = [preferredName || firstName, lastName]
                .filter(Boolean)
                .join(" ");
            return fullName || String(memberData.email || "").trim() || "Member Account";

        };


    const getAdminMemberSortValue = (memberData, field) => {
        const hasMemberName = Boolean(
            memberData.lastName || memberData.firstName || memberData.preferredName
        );
        const values = {
            member: hasMemberName
                ? `${memberData.lastName || ""}\u0000${memberData.preferredName || memberData.firstName || ""}`
                : "",
            memberId: memberData.memberId || memberData.memberNumber || "",
            email: memberData.email || "",
            status: memberData.membershipStatus || "",
            type: memberData.membershipType || "",
            memberSince: memberData.membershipStartDate || memberData.memberSince || "",
            currentThrough: memberData.membershipCurrentThrough || memberData.renewalDate || ""
        };
        return values[field] ?? "";
    };


    const getAdminDateSortValue = (value) => {
        if (!value) return null;
        const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    };


    const compareAdminMembers = (firstMember, secondMember) => {
        const firstValue = getAdminMemberSortValue(firstMember, adminMemberSort.field);
        const secondValue = getAdminMemberSortValue(secondMember, adminMemberSort.field);
        const firstIsBlank = firstValue === "" || firstValue === null || firstValue === undefined;
        const secondIsBlank = secondValue === "" || secondValue === null || secondValue === undefined;
        if (firstIsBlank !== secondIsBlank) return firstIsBlank ? 1 : -1;
        if (firstIsBlank) return 0;

        let comparison;
        if (["memberSince", "currentThrough"].includes(adminMemberSort.field)) {
            const firstDate = getAdminDateSortValue(firstValue);
            const secondDate = getAdminDateSortValue(secondValue);
            if (firstDate === null || secondDate === null) {
                if (firstDate !== secondDate) return firstDate === null ? 1 : -1;
                comparison = 0;
            } else {
                comparison = firstDate - secondDate;
            }
        } else {
            comparison = naturalAdminCollator.compare(String(firstValue), String(secondValue));
        }
        return adminMemberSort.direction === "ascending" ? comparison : -comparison;
    };


    const updateAdminSortIndicators = () => {
        adminSortButtons.forEach((button) => {
            const isActive = button.dataset.adminSort === adminMemberSort.field;
            const heading = button.closest("th");
            heading.setAttribute(
                "aria-sort",
                isActive ? adminMemberSort.direction : "none"
            );
            button.querySelector("span").textContent = isActive
                ? adminMemberSort.direction === "ascending" ? "▲" : "▼"
                : "";
        });
    };


    const getVisibleAdminMembers = () => {
        const searchTerm = adminMemberSearchInput.value.trim().toLocaleLowerCase();
        const recordsAfterSearch = adminMembers.filter((memberData) => [
                memberData.firstName,
                memberData.lastName,
                memberData.preferredName,
                memberData.email,
                memberData.memberId,
                memberData.memberNumber
            ].some((value) => String(value || "").toLocaleLowerCase().includes(searchTerm)));
        const recordsAfterDuesFilter = recordsAfterSearch.filter(
            (memberData) => adminMemberFilter.value !== "dues" ||
                DUES_ATTENTION_STATUSES.has(memberData.membershipStatus)
        );
        logAdminMembershipDebug({
            recordsAfterSearch: recordsAfterSearch.length,
            recordsAfterDuesFilter: recordsAfterDuesFilter.length
        });
        return recordsAfterDuesFilter.sort(compareAdminMembers);
    };


    const buildCanonicalAdminMemberList = (memberAccounts) => {
        const membersByUid = new Map();

        memberAccounts.forEach((memberData) => {
            const documentUid = memberData.uid;

            if (membersByUid.has(documentUid)) {
                return;
            }

            // The Firestore document ID is the canonical Firebase UID. A stored
            // uid field must never override it.
            membersByUid.set(documentUid, {
                ...memberData,
                uid: documentUid
            });
        });

        return Array.from(membersByUid.values());
    };


    const renderAdminMembers =
        (membersToRender) => {

            adminMemberTableBody.replaceChildren();


            membersToRender.forEach((memberData) => {

                const row =
                    document.createElement("tr");

                const cells = [
                    ["Member", getAdminMemberName(memberData)],
                    ["Member ID", memberData.memberId || memberData.memberNumber || "—"],
                    ["Email", memberData.email || "—"],
                    ["Status", memberData.membershipStatus || "No Membership"],
                    ["Type", memberData.membershipType || "—"],
                    ["Member Since", formatAdminMembershipDate(memberData.membershipStartDate || memberData.memberSince)],
                    ["Current Through", formatAdminMembershipDate(memberData.membershipCurrentThrough || memberData.renewalDate)]
                ];


                cells.forEach(([label, value]) => {

                    const cell =
                        document.createElement("td");

                    cell.dataset.label = label;
                    cell.textContent = value;
                    row.appendChild(cell);

                });

                const actionCell =
                    document.createElement("td");

                const manageLink =
                    document.createElement("a");

                actionCell.dataset.label = "Action";
                manageLink.href =
                    `admin-member.html?id=${encodeURIComponent(memberData.uid)}`;
                manageLink.textContent = "View / Manage";
                manageLink.className = "admin-manage-link";
                actionCell.appendChild(manageLink);
                row.appendChild(actionCell);


                adminMemberTableBody.appendChild(row);

            });


            adminMemberMessage.textContent =
                membersToRender.length > 0
                    ? `${membersToRender.length} account${membersToRender.length === 1 ? "" : "s"} found.`
                    : "No accounts match your search.";
            logAdminMembershipDebug({recordsRendered: membersToRender.length});

        };


    adminMemberSearchInput.addEventListener(
        "input",
        () => {
            renderAdminMembers(getVisibleAdminMembers());

        }
    );


    adminMemberFilter.addEventListener("change", () => {
        const url = new URL(window.location.href);
        if (adminMemberFilter.value === "dues") url.searchParams.set("filter", "dues");
        else url.searchParams.delete("filter");
        window.history.replaceState({}, "", url);
        renderAdminMembers(getVisibleAdminMembers());
    });


    adminSortButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const selectedField = button.dataset.adminSort;
            if (adminMemberSort.field === selectedField) {
                adminMemberSort.direction = adminMemberSort.direction === "ascending"
                    ? "descending"
                    : "ascending";
            } else {
                adminMemberSort = { field: selectedField, direction: "ascending" };
            }
            updateAdminSortIndicators();
            renderAdminMembers(getVisibleAdminMembers());
        });
    });


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            logAdminMembershipDebug({
                currentUid: authenticatedUser?.uid || null,
                emailVerified: authenticatedUser?.emailVerified === true
            });

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.replace(
                    "login.html"
                );

                return;

            }


            try {
                const authorization = await getAdminAuthorization(authenticatedUser);
                logAdminMembershipDebug({
                    adminActive: authorization.active,
                    superAdmin: authorization.superAdmin
                });

                if (!authorization.active) {

                    window.location.replace(
                        "dashboard.html"
                    );

                    return;

                }


                adminMemberDirectory.hidden = false;
                adminMemberAccessMessage.textContent = "";

                try {
                    const currentUserSnapshot = await getDoc(
                        doc(db, "users", authenticatedUser.uid)
                    );
                    logAdminMembershipDebug({
                        currentUserDocumentExists: currentUserSnapshot.exists()
                    });
                } catch (error) {
                    console.warn("Admin Membership current-user diagnostic read failed.", error);
                }

                logAdminMembershipDebug({collectionQueryStarted: true});
                const [adminMemberAccounts, membershipApplications] = await Promise.all([
                    loadAdminMemberAccounts(),
                    loadAdminApplications()
                ]);
                logAdminMembershipDebug({
                    collectionQuerySucceeded: true,
                    documentsReturned: adminMemberAccounts.length
                });
                const applicationsByUid = new Map(
                    membershipApplications.map((applicationData) => [
                        applicationData.applicantUid,
                        applicationData
                    ])
                );
                adminMembers = buildCanonicalAdminMemberList(adminMemberAccounts)
                    .map((memberData) => {
                        const applicationData = applicationsByUid.get(memberData.uid);
                        if (!applicationData) return memberData;
                        return {
                            ...memberData,
                            firstName: memberData.firstName || applicationData.firstName,
                            lastName: memberData.lastName || applicationData.lastName,
                            preferredName: memberData.preferredName || applicationData.preferredName,
                            email: memberData.email || applicationData.email
                        };
                    });
                logAdminMembershipDebug({recordsAfterFiltering: adminMembers.length});
                adminMemberFilter.value =
                    new URLSearchParams(window.location.search).get("filter") === "dues"
                        ? "dues"
                        : "all";
                updateAdminSortIndicators();
                renderAdminMembers(getVisibleAdminMembers());
            } catch (error) {

                logAdminMembershipDebug({
                    collectionQuerySucceeded: false,
                    recordsRendered: 0
                });

                console.error(
                    "Admin membership data could not be loaded.",
                    error
                );

                adminMemberMessage.textContent =
                    "We couldn't load the membership accounts.";

            }

        }
    );

}


// ------------------------------------
// Admin Member Detail
// ------------------------------------

const adminMemberDetail =
    document.getElementById("adminMemberDetail");


if (adminMemberDetail) {

    const accessMessage =
        document.getElementById("adminMemberDetailAccessMessage");
    const form =
        document.getElementById("adminMembershipForm");
    const saveMessage =
        document.getElementById("adminMembershipMessage");
    const passwordResetButton =
        document.getElementById("adminSendPasswordResetButton");
    const passwordResetMessage =
        document.getElementById("adminPasswordResetMessage");
    const portalAccessCurrent = document.getElementById("adminPortalAccessCurrent");
    const portalAccessEditor = document.getElementById("adminPortalAccessEditor");
    const portalAccessLevel = document.getElementById("adminPortalAccessLevel");
    const savePortalAccessButton = document.getElementById("adminSavePortalAccessButton");
    const portalAccessMessage = document.getElementById("adminPortalAccessMessage");
    let loadedMemberData = null;
    let loadedMemberUid = "";
    let loadedPortalRole = "member";
    let viewerAuthorization = null;
    let canViewMemberHistory = false;
    const adminNameCache = new Map();
    const historyActionLabels = {
        MEMBER_ID_CHANGED: "Member ID Changed",
        MEMBERSHIP_STATUS_CHANGED: "Membership Status Changed",
        MEMBERSHIP_TYPE_CHANGED: "Membership Type Changed",
        MEMBERSHIP_START_DATE_CHANGED: "Membership Start Date Changed",
        MEMBERSHIP_CURRENT_THROUGH_CHANGED: "Membership Current Through Changed",
        APPLICATION_SPONSOR_ASSIGNED: "Application Sponsor Assigned",
        APPLICATION_SENT_TO_BOARD: "Application Sent to Board for Review",
        APPLICATION_REVISION_REQUESTED: "Application Sent Back to Applicant",
        APPLICATION_APPROVED: "Application Approved",
        APPLICATION_DECLINED: "Application Declined",
        PORTAL_ROLE_CHANGED: "Portal Access Changed"
    };

    const portalRoleLabels = {
        member: "Regular Member",
        moderator: "Moderator",
        admin: "Admin",
        superAdmin: "Super Admin"
    };

    const getTrustedPortalRole = (authorizationData = {}) => {
        if (authorizationData.active === true && authorizationData.superAdmin === true) {
            return "superAdmin";
        }
        if (authorizationData.active === true && authorizationData.role === "moderator") {
            return "moderator";
        }
        if (authorizationData.active === true &&
            (authorizationData.role === "admin" || !authorizationData.role)) {
            return "admin";
        }
        return "member";
    };

    const renderPortalAccess = () => {
        portalAccessCurrent.textContent = portalRoleLabels[loadedPortalRole];
        portalAccessLevel.value = ["moderator", "admin"].includes(loadedPortalRole)
            ? loadedPortalRole
            : "member";
        const readOnly = loadedPortalRole === "superAdmin" || loadedMemberUid === auth.currentUser?.uid;
        portalAccessEditor.hidden = readOnly;
        portalAccessMessage.textContent = loadedPortalRole === "superAdmin"
            ? "Super Admin access cannot be changed here."
            : loadedMemberUid === auth.currentUser?.uid
                ? "You cannot change your own portal access level here."
                : "";
    };

    const formatHistoryValue = (entry, value) => {
        if (value === null || value === undefined || value === "") return "Not Set";
        if (entry.field === "portalRole") {
            return portalRoleLabels[value] || String(value);
        }
        if (["membershipStartDate", "membershipCurrentThrough"].includes(entry.field)) {
            const date = typeof value.toDate === "function"
                ? value.toDate()
                : new Date(`${value}T00:00:00`);
            if (!Number.isNaN(date.getTime())) {
                return new Intl.DateTimeFormat(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                }).format(date);
            }
        }
        return String(value);
    };

    const resolveAdminDisplayName = async (adminUid) => {
        if (!adminUid) return "Admin";
        if (adminNameCache.has(adminUid)) return adminNameCache.get(adminUid);

        let displayName = "Admin";
        try {
            const profileSnapshot = await getDoc(doc(db, "memberProfiles", adminUid));
            if (profileSnapshot.exists()) {
                const profileData = profileSnapshot.data();
                const fullName = [profileData.firstName, profileData.lastName]
                    .filter((namePart) => String(namePart || "").trim())
                    .map((namePart) => String(namePart).trim())
                    .join(" ");
                displayName = fullName || profileData.displayName || "Admin";
            }

            if (displayName === "Admin") {
                const userSnapshot = await getDoc(doc(db, "users", adminUid));
                if (userSnapshot.exists()) {
                    const userData = userSnapshot.data();
                    const fullName = [userData.firstName, userData.lastName]
                        .filter((namePart) => String(namePart || "").trim())
                        .map((namePart) => String(namePart).trim())
                        .join(" ");
                    if (fullName) displayName = fullName;
                }
            }

            if (displayName === "Admin") {
                const authorizationSnapshot = await getDoc(doc(db, "adminUsers", adminUid));
                const authorization = authorizationSnapshot.exists()
                    ? authorizationSnapshot.data()
                    : {};
                if (authorization.active === true && authorization.superAdmin === true) {
                    displayName = "Super Admin";
                }
            }
        } catch (error) {
            console.warn("History Admin name could not be resolved; using a role label.", error);
        }

        adminNameCache.set(adminUid, displayName);
        return displayName;
    };

    const resolveHistoryAdminNames = async (entries) => {
        const uniqueAdminUids = Array.from(new Set(
            entries.map((entry) => entry.performedBy).filter(Boolean)
        ));
        await Promise.all(uniqueAdminUids.map(resolveAdminDisplayName));
    };

    const loadMemberHistory = async (memberUid) => {
        adminMemberDetail.querySelector(".member-history-panel")?.remove();
        const panel = document.createElement("section");
        panel.className = "admin-detail-card member-history-panel";
        const heading = document.createElement("h3");
        heading.textContent = "History Log";
        const status = document.createElement("p");
        status.className = "profile-muted";
        status.textContent = "Loading history...";
        const list = document.createElement("ol");
        list.className = "member-history-list";
        const controls = document.createElement("div");
        controls.className = "member-history-controls";
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.textContent = "Show Full History";
        toggleButton.hidden = true;
        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.textContent = "Download Full History";
        downloadButton.hidden = true;
        const downloadStatus = document.createElement("p");
        downloadStatus.className = "profile-muted member-history-download-status";
        downloadStatus.setAttribute("role", "status");
        controls.append(toggleButton, downloadButton);
        panel.append(heading, status, controls, downloadStatus, list);
        adminMemberDetail.appendChild(panel);

        try {
            const snapshot = await getDocs(
                collection(db, "memberHistory", memberUid, "entries")
            );
            const entries = snapshot.docs
                .map((historySnapshot) => historySnapshot.data())
                .sort((first, second) => {
                    const firstTime = first.performedAt?.toMillis?.() || 0;
                    const secondTime = second.performedAt?.toMillis?.() || 0;
                    return secondTime - firstTime;
                });
            await resolveHistoryAdminNames(entries);
            entries.forEach((entry) => {
                entry.actorName = adminNameCache.get(entry.performedBy) || "Admin";
            });
            status.textContent = entries.length
                ? `${entries.length} recorded event${entries.length === 1 ? "" : "s"}.`
                : "No history has been recorded for this account yet.";

            let showFullHistory = false;
            const renderEntries = () => {
                list.replaceChildren();
                const visibleEntries = showFullHistory ? entries : entries.slice(0, 5);
                visibleEntries.forEach((entry) => {
                    const item = document.createElement("li");
                    const date = document.createElement("time");
                    date.textContent = entry.performedAt?.toDate
                        ? new Intl.DateTimeFormat(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                        }).format(entry.performedAt.toDate())
                        : "Date unavailable";
                    const title = document.createElement("strong");
                    title.textContent = historyActionLabels[entry.action] || "Administrative Event";
                    item.append(date, title);
                    if (entry.field) {
                        const change = document.createElement("p");
                        change.textContent = `${formatHistoryValue(entry, entry.oldValue)} → ${formatHistoryValue(entry, entry.newValue)}`;
                        item.appendChild(change);
                    }
                    const actor = document.createElement("p");
                    actor.className = "member-history-actor";
                    actor.textContent = `Changed by ${entry.actorName}`;
                    item.appendChild(actor);
                    if (entry.note) {
                        const note = document.createElement("p");
                        note.textContent = entry.note;
                        item.appendChild(note);
                    }
                    list.appendChild(item);
                });
            };

            renderEntries();
            toggleButton.hidden = entries.length <= 5;
            downloadButton.hidden = entries.length === 0;
            toggleButton.addEventListener("click", () => {
                showFullHistory = !showFullHistory;
                toggleButton.textContent = showFullHistory
                    ? "Show Recent Only"
                    : "Show Full History";
                renderEntries();
            });
            downloadButton.addEventListener("click", async () => {
                downloadButton.disabled = true;
                downloadStatus.textContent = "Preparing full history PDF...";
                try {
                    await generateMemberHistoryPdf({
                        memberData: loadedMemberData,
                        entries,
                        actionLabels: historyActionLabels,
                        formatValue: formatHistoryValue
                    });
                    downloadStatus.textContent = "Full history downloaded.";
                } catch (error) {
                    console.error("Member history PDF could not be generated.", error);
                    downloadStatus.textContent =
                        "We couldn't download the full history. Please try again.";
                } finally {
                    downloadButton.disabled = false;
                }
            });
        } catch (error) {
            console.error("Member history could not be loaded.", error);
            status.textContent = "We couldn't load this account's history.";
        }
    };

    const setText = (id, value) => {
        document.getElementById(id).textContent = value || "—";
    };

    const toDateInputValue = (value) => {
        if (!value) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
        const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    };

    const populateSelect = (select, options, blankLabel) => {
        select.replaceChildren();
        if (blankLabel) {
            const blankOption = document.createElement("option");
            blankOption.value = "";
            blankOption.textContent = blankLabel;
            select.appendChild(blankOption);
        }
        options.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    };

    populateSelect(
        document.getElementById("adminMembershipStatus"),
        MEMBERSHIP_STATUSES,
        "No Membership Status"
    );
    populateSelect(
        document.getElementById("adminMembershipType"),
        MEMBERSHIP_TYPES,
        "Not Assigned"
    );

    passwordResetButton.addEventListener("click", async () => {
        const memberEmail = loadedMemberData?.email?.trim();
        if (!memberEmail) {
            passwordResetMessage.textContent =
                "This account does not have an email address available for password reset.";
            return;
        }
        if (!window.confirm(`Send a password reset email to ${memberEmail}?`)) return;

        passwordResetButton.disabled = true;
        passwordResetMessage.textContent = "Sending password reset email...";
        try {
            await sendPasswordResetEmail(auth, memberEmail);
            passwordResetMessage.textContent = "Password reset email sent.";
        } catch (error) {
            console.error("Admin password reset email could not be sent.", error);
            passwordResetMessage.textContent =
                "We couldn't send the password reset email. Please try again.";
        } finally {
            passwordResetButton.disabled = false;
        }
    });

    savePortalAccessButton.addEventListener("click", async () => {
        const adminUser = auth.currentUser;
        const requestedRole = portalAccessLevel.value;
        if (!adminUser || !viewerAuthorization?.active) return;
        if (loadedMemberUid === adminUser.uid) {
            portalAccessMessage.textContent = "You cannot change your own portal access level here.";
            return;
        }
        if (loadedPortalRole === "superAdmin") {
            portalAccessMessage.textContent = "Super Admin access cannot be changed here.";
            return;
        }
        if (!['member', 'moderator', 'admin'].includes(requestedRole) || requestedRole === loadedPortalRole) {
            portalAccessMessage.textContent = requestedRole === loadedPortalRole
                ? "This account already has that access level."
                : "Choose a valid access level.";
            return;
        }

        const memberName = getApplicationApplicantName(loadedMemberData);
        const confirmation = requestedRole === "member" && loadedPortalRole === "admin"
            ? `Remove Admin access from ${memberName} and return this account to Regular Member?`
            : `Change ${memberName} from ${portalRoleLabels[loadedPortalRole]} to ${portalRoleLabels[requestedRole]}?`;
        if (!window.confirm(confirmation)) return;

        savePortalAccessButton.disabled = true;
        portalAccessMessage.textContent = "Saving portal access...";
        try {
            const authorization = await getAdminAuthorization(adminUser);
            if (!authorization.active) throw new Error("Admin authorization is no longer active.");
            const [targetAuthorizationSnapshot, targetProfileSnapshot] = await Promise.all([
                getDoc(doc(db, "adminUsers", loadedMemberUid)),
                getDoc(doc(db, "memberProfiles", loadedMemberUid))
            ]);
            const currentRole = getTrustedPortalRole(
                targetAuthorizationSnapshot.exists() ? targetAuthorizationSnapshot.data() : {}
            );
            if (currentRole === "superAdmin") throw new Error("Super Admin access cannot be changed here.");
            if (!targetProfileSnapshot.exists()) {
                throw new Error("This member must have a member profile before portal access can be assigned.");
            }

            const batch = writeBatch(db);
            const authorizationRef = doc(db, "adminUsers", loadedMemberUid);
            const profileRef = doc(db, "memberProfiles", loadedMemberUid);
            if (requestedRole === "member") {
                batch.delete(authorizationRef);
                batch.set(profileRef, {portalRole: deleteField()}, {merge: true});
            } else {
                batch.set(authorizationRef, {active: true, role: requestedRole});
                batch.set(profileRef, {portalRole: requestedRole}, {merge: true});
            }
            batch.set(createMemberHistoryRef(loadedMemberUid), buildMemberHistoryEntry({
                memberUid: loadedMemberUid,
                action: "PORTAL_ROLE_CHANGED",
                category: "administration",
                performedBy: adminUser.uid,
                field: "portalRole",
                oldValue: currentRole,
                newValue: requestedRole,
                source: "Admin Member Management"
            }));
            await batch.commit();
            loadedPortalRole = requestedRole;
            renderPortalAccess();
            portalAccessMessage.textContent =
                `Portal access changed to ${portalRoleLabels[requestedRole]}.`;
            if (canViewMemberHistory) await loadMemberHistory(loadedMemberUid);
        } catch (error) {
            console.error("Portal access could not be changed.", error);
            portalAccessMessage.textContent = error.message ||
                "We couldn't change portal access. Please try again.";
        } finally {
            savePortalAccessButton.disabled = false;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveMessage.textContent = "Saving membership changes...";
        const authenticatedAdmin = auth.currentUser;
        let writeStage = "authorization";

        const values = {
            memberId: document.getElementById("adminMemberId").value.trim(),
            membershipStatus: document.getElementById("adminMembershipStatus").value,
            membershipType: document.getElementById("adminMembershipType").value,
            membershipStartDate: document.getElementById("adminMembershipStartDate").value,
            membershipCurrentThrough: document.getElementById("adminMembershipCurrentThrough").value
        };
        const historyActions = {
            memberId: "MEMBER_ID_CHANGED",
            membershipStatus: "MEMBERSHIP_STATUS_CHANGED",
            membershipType: "MEMBERSHIP_TYPE_CHANGED",
            membershipStartDate: "MEMBERSHIP_START_DATE_CHANGED",
            membershipCurrentThrough: "MEMBERSHIP_CURRENT_THROUGH_CHANGED"
        };

        try {
            const viewerAuthorization = await getAdminAuthorization(authenticatedAdmin);
            if (!authenticatedAdmin || !viewerAuthorization.active) {
                window.location.replace("dashboard.html");
                return;
            }

            writeStage = "load-current-documents";
            const [currentMemberSnapshot, currentMemberProfileSnapshot] = await Promise.all([
                getDoc(doc(db, "users", loadedMemberUid)),
                getDoc(doc(db, "memberProfiles", loadedMemberUid))
            ]);
            if (!currentMemberSnapshot.exists()) {
                saveMessage.textContent = "This membership account no longer exists.";
                return;
            }
            loadedMemberData = currentMemberSnapshot.data();

            const userRef = doc(db, "users", loadedMemberUid);
            const memberProfileRef = doc(db, "memberProfiles", loadedMemberUid);
            const updatedAt = new Date().toISOString();
            const membershipUpdate = {
                membershipUpdatedAt: updatedAt,
                membershipUpdatedBy: authenticatedAdmin.uid
            };

            const memberProfileSource = {
                ...loadedMemberData,
                ...values,
                // Canonical fields intentionally supersede legacy aliases,
                // including when an Admin clears a value.
                memberNumber: "",
                memberSince: "",
                renewalDate: "",
                updatedAt: loadedMemberData.updatedAt || updatedAt
            };
            const memberProfileData =
                buildMemberProfileData(loadedMemberUid, memberProfileSource);
            const memberProfileMembershipUpdate = {
                membershipStatus: memberProfileData.membershipStatus,
                sponsorEligible: memberProfileData.sponsorEligible,
                memberId: memberProfileData.memberId || deleteField(),
                membershipType: memberProfileData.membershipType || deleteField(),
                membershipStartDate: memberProfileData.membershipStartDate || deleteField(),
                membershipCurrentThrough: memberProfileData.membershipCurrentThrough || deleteField()
            };
            const batch = writeBatch(db);
            const historyChanges = Object.entries(values)
                .map(([field, value]) => ({
                    field,
                    oldValue: Object.prototype.hasOwnProperty.call(loadedMemberData, field)
                        ? loadedMemberData[field]
                        : null,
                    newValue: value || null,
                    oldComparable: ["membershipStartDate", "membershipCurrentThrough"].includes(field)
                        ? toDateInputValue(loadedMemberData[field])
                        : String(loadedMemberData[field] || ""),
                    newComparable: value
                }))
                .filter(({oldComparable, newComparable}) => oldComparable !== newComparable);

            historyChanges.forEach(({field, newValue}) => {
                membershipUpdate[field] = newValue || deleteField();
            });

            const changedUserKeys = [
                ...historyChanges.map(({field}) => field),
                "membershipUpdatedAt",
                "membershipUpdatedBy"
            ];
            console.log("[Admin Membership Save Debug]", {
                viewerAdmin: viewerAuthorization.active,
                viewerSuperAdmin: viewerAuthorization.superAdmin,
                targetUid: loadedMemberUid,
                oldMembershipStatus: loadedMemberData.membershipStatus || null,
                newMembershipStatus: values.membershipStatus || null,
                changedUserKeys,
                memberProfileWriteIncluded: true,
                historyWriteIncluded: historyChanges.length > 0,
                historyActionCount: historyChanges.length
            });

            batch.set(userRef, membershipUpdate, { merge: true });
            if (currentMemberProfileSnapshot.exists()) {
                // Existing public profile content is already privacy-sanitized. Update
                // only the canonical membership projection allowed by the Admin rule.
                batch.set(memberProfileRef, memberProfileMembershipUpdate, { merge: true });
            } else {
                batch.set(memberProfileRef, memberProfileData);
            }
            historyChanges.forEach(({field, oldValue, newValue}) => {
                batch.set(createMemberHistoryRef(loadedMemberUid), buildMemberHistoryEntry({
                    memberUid: loadedMemberUid,
                    action: historyActions[field],
                    category: "membership",
                    performedBy: authenticatedAdmin.uid,
                    field,
                    oldValue,
                    newValue,
                    source: "Admin Membership"
                }));
            });
            writeStage = "commit-membership-batch";
            await batch.commit();

            loadedMemberData = memberProfileSource;
            saveMessage.textContent = "Membership changes saved successfully.";
            if (canViewMemberHistory) {
                await loadMemberHistory(loadedMemberUid);
            }
        } catch (error) {
            console.error("Admin membership changes could not be saved.", {
                writeStage,
                error
            });
            saveMessage.textContent = "We couldn't save the membership changes. Please try again.";
        }
    });

    onAuthStateChanged(auth, async (authenticatedUser) => {
        if (!authenticatedUser || !authenticatedUser.emailVerified) {
            window.location.replace("login.html");
            return;
        }

        try {
            const authorization = await getAdminAuthorization(authenticatedUser);
            viewerAuthorization = authorization;
            canViewMemberHistory = authorization.active;
            if (!authorization.active) {
                window.location.replace("dashboard.html");
                return;
            }

            loadedMemberUid =
                new URLSearchParams(window.location.search).get("id") || "";
            if (!loadedMemberUid) {
                accessMessage.textContent = "No membership account was selected.";
                return;
            }

            const [userSnapshot, targetAuthorizationSnapshot] = await Promise.all([
                getDoc(doc(db, "users", loadedMemberUid)),
                getDoc(doc(db, "adminUsers", loadedMemberUid))
                    .catch(() => null)
            ]);
            if (!userSnapshot.exists()) {
                accessMessage.textContent = "That membership account could not be found.";
                return;
            }

            loadedMemberData = userSnapshot.data();
            loadedPortalRole = getTrustedPortalRole(
                targetAuthorizationSnapshot?.exists() ? targetAuthorizationSnapshot.data() : {}
            );
            setText("adminMemberName", getApplicationApplicantName(loadedMemberData));
            setText("adminMemberPreferredName", loadedMemberData.preferredName);
            setText("adminMemberEmail", loadedMemberData.email);
            setText("adminMemberUid", loadedMemberUid);
            setText("adminMemberCreatedAt", toDateInputValue(loadedMemberData.createdAt));
            setText("adminMemberPhone", loadedMemberData.phone);
            setText("adminMemberLocation", [
                loadedMemberData.city,
                loadedMemberData.subdivisionName || loadedMemberData.state,
                loadedMemberData.countryName || loadedMemberData.country
            ].filter(Boolean).join(", "));
            setText("adminMemberProfileCompletion", loadedMemberData.profileCompleted ? "Complete" : "Incomplete");

            document.getElementById("adminMemberId").value = loadedMemberData.memberId || "";
            document.getElementById("adminMembershipStatus").value =
                MEMBERSHIP_STATUSES.includes(loadedMemberData.membershipStatus) ? loadedMemberData.membershipStatus : "";
            document.getElementById("adminMembershipType").value =
                MEMBERSHIP_TYPES.includes(loadedMemberData.membershipType) ? loadedMemberData.membershipType : "";
            document.getElementById("adminMembershipStartDate").value = toDateInputValue(loadedMemberData.membershipStartDate);
            document.getElementById("adminMembershipCurrentThrough").value = toDateInputValue(loadedMemberData.membershipCurrentThrough);
            renderPortalAccess();

            adminMemberDetail.hidden = false;
            accessMessage.textContent = "";
            if (canViewMemberHistory) {
                await loadMemberHistory(loadedMemberUid);
            }
        } catch (error) {
            console.error("Admin member details could not be loaded.", error);
            accessMessage.textContent = "We couldn't load this membership account.";
        }
    });
}


// ------------------------------------
// Member Lookup
// ------------------------------------

const memberDirectory =
    document.getElementById(
        "memberDirectory"
    );


if (memberDirectory) {

    const memberSearchInput =
        document.getElementById(
            "memberSearchInput"
        );

    const memberResults =
        document.getElementById(
            "memberResults"
        );

    const memberDirectoryMessage =
        document.getElementById(
            "memberDirectoryMessage"
        );

    let directoryMembers = [];


    const getMemberInitials =
        (memberData) => {

            return `${(memberData.firstName || "").charAt(0)}${(memberData.lastName || "").charAt(0)}`
                .toUpperCase() ||
                "WBA";

        };


    const getMemberDisplayName =
        (memberData) => {

            return memberData.displayName ||
                `${memberData.preferredName || memberData.firstName || ""} ${memberData.lastName || ""}`
                    .trim() ||
                "WBA Member";

        };


    const loadMemberPhoto =
        async (
            memberData,
            photoImage,
            photoPlaceholder
        ) => {

            if (!memberData.profilePhotoPath) {
                return;
            }


            try {

                const photoRef =
                    ref(
                        storage,
                        memberData.profilePhotoPath
                    );

                const photoURL =
                    new URL(
                        await getDownloadURL(photoRef)
                    );


                if (memberData.profilePhotoUpdatedAt) {

                    photoURL.searchParams.set(
                        "updatedAt",
                        memberData.profilePhotoUpdatedAt
                    );

                }


                photoImage.onerror = () => {

                    photoImage.style.display =
                        "none";

                    photoPlaceholder.style.display =
                        "flex";

                };

                photoImage.src =
                    photoURL.toString();

                photoImage.style.display =
                    "block";

                photoPlaceholder.style.display =
                    "none";

            } catch (error) {

                console.error(
                    "Member directory photo could not be loaded.",
                    error
                );

            }

        };


    const renderMemberCard =
        (memberData) => {

            const memberCard =
                document.createElement("a");

            memberCard.className =
                "member-card";

            memberCard.href =
                `profile.html?id=${encodeURIComponent(memberData.uid)}`;


            const photoContainer =
                document.createElement("div");

            photoContainer.className =
                "member-card-photo";

            const photoImage =
                document.createElement("img");

            photoImage.className =
                "member-card-photo-image";

            photoImage.alt =
                `${getMemberDisplayName(memberData)} profile photo`;

            photoImage.style.display =
                "none";

            const photoPlaceholder =
                document.createElement("div");

            photoPlaceholder.className =
                "member-card-photo-placeholder";

            photoPlaceholder.textContent =
                getMemberInitials(memberData);

            photoContainer.append(
                photoImage,
                photoPlaceholder
            );


            const memberDetails =
                document.createElement("div");

            memberDetails.className =
                "member-card-details";

            const memberName =
                document.createElement("h2");

            memberName.textContent =
                getMemberDisplayName(memberData);

            memberDetails.appendChild(
                memberName
            );

            if (memberData.portalRole === "admin" || memberData.portalRole === "moderator") {
                const portalRole = document.createElement("span");
                portalRole.className = "portal-role-label";
                portalRole.textContent = memberData.portalRole === "admin" ? "Admin" : "Moderator";
                memberDetails.appendChild(portalRole);
            }


            if (memberData.location) {

                const memberLocation =
                    document.createElement("p");

                memberLocation.className =
                    "member-card-location";

                memberLocation.textContent =
                    memberData.location;

                memberDetails.appendChild(
                    memberLocation
                );

            }


            const membershipLabel =
                memberData.membershipType ||
                getMemberFacingStatus(
                    memberData.membershipStatus
                );


            if (membershipLabel) {

                const memberMembership =
                    document.createElement("p");

                memberMembership.className =
                    "member-card-membership";

                memberMembership.textContent =
                    membershipLabel;

                memberDetails.appendChild(
                    memberMembership
                );

            }


            if (
                Array.isArray(memberData.wbaRoles) &&
                memberData.wbaRoles.length > 0
            ) {

                const roleList =
                    document.createElement("div");

                roleList.className =
                    "profile-badges";


                memberData.wbaRoles.forEach((role) => {

                    const roleName =
                        typeof role === "string"
                            ? role
                            : role?.name;


                    if (!roleName) {
                        return;
                    }


                    const roleBadge =
                        document.createElement("span");

                    roleBadge.className =
                        "profile-role-badge";

                    roleBadge.textContent =
                        roleName;

                    roleList.appendChild(
                        roleBadge
                    );

                });


                if (roleList.children.length > 0) {

                    memberDetails.appendChild(
                        roleList
                    );

                }

            }


            const viewProfileLabel =
                document.createElement("span");

            viewProfileLabel.className =
                "member-card-action";

            viewProfileLabel.textContent =
                "View Profile";

            memberDetails.appendChild(
                viewProfileLabel
            );

            memberCard.append(
                photoContainer,
                memberDetails
            );

            loadMemberPhoto(
                memberData,
                photoImage,
                photoPlaceholder
            );


            return memberCard;

        };


    const renderMemberDirectory =
        (members, hasSearchQuery = false) => {

            memberResults.replaceChildren();


            if (members.length === 0) {

                memberDirectoryMessage.textContent =
                    hasSearchQuery
                        ? "No members match your search."
                        : "No members are available yet.";

                return;

            }


            memberDirectoryMessage.textContent =
                "";


            members.forEach((memberData) => {

                memberResults.appendChild(
                    renderMemberCard(memberData)
                );

            });

        };


    const filterMembers =
        (searchQuery) => {

            const normalizedQuery =
                searchQuery
                    .trim()
                    .toLocaleLowerCase();


            if (!normalizedQuery) {
                return directoryMembers;
            }


            return directoryMembers.filter(
                (memberData) => {

                    const searchableNames = [
                        memberData.displayName,
                        memberData.firstName,
                        memberData.lastName,
                        memberData.preferredName
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLocaleLowerCase();


                    return searchableNames.includes(
                        normalizedQuery
                    );

                }
            );

        };


    const loadMemberDirectory =
        async () => {

            memberDirectoryMessage.textContent =
                "Loading members...";


            try {

                const memberProfilesSnapshot =
                    await getDocs(
                        collection(
                            db,
                            "memberProfiles"
                        )
                    );

                directoryMembers =
                    memberProfilesSnapshot.docs
                        .map((memberDocument) => ({
                            ...memberDocument.data(),
                            uid: memberDocument.id
                        }))
                        .sort((firstMember, secondMember) =>
                            getMemberDisplayName(firstMember)
                                .localeCompare(
                                    getMemberDisplayName(secondMember),
                                    undefined,
                                    {
                                        sensitivity: "base"
                                    }
                                )
                        );


                renderMemberDirectory(
                    directoryMembers
                );

            } catch (error) {

                console.error(error);

                memberResults.replaceChildren();

                memberDirectoryMessage.textContent =
                    "We couldn't load the member directory. Please try again.";

            }

        };


    memberSearchInput.addEventListener(
        "input",
        () => {

            const searchQuery =
                memberSearchInput.value;


            renderMemberDirectory(
                filterMembers(searchQuery),
                Boolean(searchQuery.trim())
            );

        }
    );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (
                !authenticatedUser ||
                !authenticatedUser.emailVerified
            ) {

                window.location.href =
                    "login.html";

                return;

            }


            await loadMemberDirectory();

        }
    );

}


// ------------------------------------
// Member Profile
// ------------------------------------

// ------------------------------------
// Member Profile Display
// ------------------------------------

const memberProfile =
    document.getElementById("memberProfile");


if (memberProfile) {

    const profileMessage =
        document.getElementById("profileMessage");

    const editProfileButton =
        document.getElementById(
            "editProfileButton"
        );

    const viewAsOthersButton =
        document.getElementById(
            "viewAsOthersButton"
        );

    const profilePreviewBanner =
        document.getElementById(
            "profilePreviewBanner"
        );


    onAuthStateChanged(
        auth,
        async (authenticatedUser) => {

            if (!authenticatedUser) {

                window.location.href =
                    "login.html";

                return;

            }


            if (!authenticatedUser.emailVerified) {

                window.location.href =
                    "login.html";

                return;

            }


            const profileParameters =
                new URLSearchParams(
                    window.location.search
                );

            const requestedProfileOwnerId =
                profileParameters.get("id")?.trim();

            const profileOwnerId =
                requestedProfileOwnerId ||
                authenticatedUser.uid;

            const isOwner =
                profileOwnerId ===
                authenticatedUser.uid;

            const isMemberPreview =
                isOwner &&
                profileParameters.get("preview") ===
                    "member";

            const usesOwnerView =
                isOwner && !isMemberPreview;


            editProfileButton.style.display =
                usesOwnerView
                    ? "inline-block"
                    : "none";

            viewAsOthersButton.style.display =
                usesOwnerView
                    ? "inline-block"
                    : "none";

            profilePreviewBanner.style.display =
                isMemberPreview
                    ? "flex"
                    : "none";


            try {

                const profileOwnerRef =
                    doc(
                        db,
                        usesOwnerView
                            ? "users"
                            : "memberProfiles",
                        profileOwnerId
                    );

                const profileOwnerSnapshot =
                    await getDoc(profileOwnerRef);


                if (!profileOwnerSnapshot.exists()) {

                    profileMessage.textContent =
                        isMemberPreview
                            ? "Your member-facing profile has not been generated yet. Save Edit Profile once and try again."
                            : "We couldn't find this member profile.";

                    return;

                }


                let profileOwnerData =
                    profileOwnerSnapshot.data();

                if (usesOwnerView) {
                    const publicProfileSnapshot = await getDoc(
                        doc(db, "memberProfiles", profileOwnerId)
                    );
                    if (publicProfileSnapshot.exists()) {
                        profileOwnerData = {
                            ...profileOwnerData,
                            portalRole: publicProfileSnapshot.data().portalRole
                        };
                    }
                }

                // -------------------------
                // Name
                // -------------------------

                const firstName =
                    profileOwnerData.firstName || "";

                const lastName =
                    profileOwnerData.lastName || "";

                const preferredName =
                    profileOwnerData.preferredName || "";


                const displayFirstName =
                    preferredName || firstName;


                const displayName =
                    `${displayFirstName} ${lastName}`.trim();


                document.getElementById(
                    "profileDisplayName"
                ).textContent =
                    displayName || "WBA Member";

                const profilePortalRole = document.getElementById("profilePortalRole");
                const visiblePortalRole = profileOwnerData.portalRole === "admin"
                    ? "Admin"
                    : profileOwnerData.portalRole === "moderator"
                        ? "Moderator"
                        : "";
                profilePortalRole.textContent = visiblePortalRole;
                profilePortalRole.hidden = !visiblePortalRole;


                // -------------------------
                // Profile Initials
                // -------------------------

                const initials =
                    `${firstName.charAt(0)}${lastName.charAt(0)}`
                        .toUpperCase();


                document.getElementById(
                    "profileInitials"
                ).textContent =
                    initials || "WBA";


                // -------------------------
                // Profile Photo
                // -------------------------

                if (profileOwnerData.profilePhotoPath) {

                    const profilePhoto =
                        document.getElementById(
                            "profilePhoto"
                        );

                    const profilePhotoPlaceholder =
                        document.getElementById(
                            "profilePhotoPlaceholder"
                        );


                    try {

                        const photoRef =
                            ref(
                                storage,
                                profileOwnerData.profilePhotoPath
                            );

                        const photoURL =
                            new URL(
                                await getDownloadURL(photoRef)
                            );


                        if (profileOwnerData.profilePhotoUpdatedAt) {

                            photoURL.searchParams.set(
                                "updatedAt",
                                profileOwnerData.profilePhotoUpdatedAt
                            );

                        }


                        profilePhoto.onerror = () => {

                            profilePhoto.style.display =
                                "none";

                            profilePhotoPlaceholder.style.display =
                                "flex";

                        };


                        profilePhoto.src =
                            photoURL.toString();

                        profilePhoto.style.display =
                            "block";

                        profilePhotoPlaceholder.style.display =
                            "none";

                    } catch (error) {

                        console.error(
                            "Profile photo could not be loaded.",
                            error
                        );

                        profilePhoto.style.display =
                            "none";

                        profilePhotoPlaceholder.style.display =
                            "flex";

                    }

                }


             // -------------------------
// Location
// -------------------------

const profileLocation =
    usesOwnerView
        ? buildDisplayLocation(
            profileOwnerData,
            "full"
        )
        : profileOwnerData.location ||
            (
                profileOwnerData.locationVisibility ===
                    "private"
                    ? "Private"
                    : "Not provided"
            );


const profileHeaderLocation =
    document.getElementById(
        "profileLocation"
    );


if (
    profileLocation &&
    profileLocation !== "Private" &&
    profileLocation !== "Not provided"
) {

    profileHeaderLocation.textContent =
        profileLocation;

    profileHeaderLocation.style.display =
        "block";

} else {

    profileHeaderLocation.textContent = "";
    profileHeaderLocation.style.display =
        "none";

}


document.getElementById(
    "profileFullLocation"
).textContent =
    profileLocation || "Not provided";


// -------------------------
// Contact
// -------------------------

const profileOwnerEmail =
    profileOwnerData.email ||
    (usesOwnerView
        ? authenticatedUser.email
        : "");


if (
    usesOwnerView ||
    profileOwnerData.email
) {

    document.getElementById(
        "profileEmail"
    ).textContent =
        profileOwnerEmail || "Not provided";

} else {

    document.getElementById(
        "profileEmail"
    ).textContent =
        "Private";

}


if (
    usesOwnerView ||
    profileOwnerData.phone
) {

    document.getElementById(
        "profilePhone"
    ).textContent =
        profileOwnerData.phone || "Not provided";

} else {

    document.getElementById(
        "profilePhone"
    ).textContent =
        "Private";

}
// -------------------------
// About
// -------------------------

if (
    usesOwnerView &&
    profileOwnerData.about
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        profileOwnerData.about;

    document.getElementById(
        "profileAbout"
    ).classList.remove(
        "profile-muted"
    );

} else if (profileOwnerData.about) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        profileOwnerData.about;

    document.getElementById(
        "profileAbout"
    ).classList.remove(
        "profile-muted"
    );

} else if (
    !usesOwnerView &&
    profileOwnerData.aboutVisibility ===
        "private"
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        "Private";

}


                // -------------------------
                // WBA Roles
                // -------------------------

                const wbaRoles =
                    Array.isArray(profileOwnerData.wbaRoles)
                        ? profileOwnerData.wbaRoles
                        : [];

                const roleNames =
                    wbaRoles
                        .map((role) =>
                            typeof role === "string"
                                ? role
                                : role?.name
                        )
                        .filter(Boolean);

                const profileHeaderRoles =
                    document.getElementById(
                        "profileHeaderRoles"
                    );


                if (roleNames.length > 0) {

                    profileHeaderRoles.textContent =
                        roleNames.join(", ");

                    profileHeaderRoles.style.display =
                        "block";

                } else {

                    profileHeaderRoles.textContent = "";
                    profileHeaderRoles.style.display =
                        "none";

                }

                const wbaRolesContainer =
                    document.getElementById(
                        "wbaRoles"
                    );


                const wbaRolesSection =
                    document.getElementById(
                        "wbaRolesSection"
                    );


                wbaRolesSection.style.display =
                    usesOwnerView
                        ? "block"
                        : "none";


                if (
                    usesOwnerView &&
                    roleNames.length > 0
                ) {

                    wbaRolesContainer.replaceChildren();


                    roleNames.forEach((roleName) => {


                        const roleBadge =
                            document.createElement(
                                "span"
                            );

                        roleBadge.className =
                            "profile-role-badge";

                        roleBadge.textContent =
                            roleName;

                        wbaRolesContainer.appendChild(
                            roleBadge
                        );

                    });


                    if (!wbaRolesContainer.children.length) {

                        const noRolesMessage =
                            document.createElement(
                                "p"
                            );

                        noRolesMessage.className =
                            "profile-muted";

                        noRolesMessage.textContent =
                            "No current WBA roles.";

                        wbaRolesContainer.appendChild(
                            noRolesMessage
                        );

                    }

                }


                // -------------------------
                // Membership Information
                // -------------------------

                const formatMembershipDate =
                    (value) => {

                        if (!value) {
                            return "—";
                        }


                        let date;


                        if (
                            typeof value === "string" &&
                            /^\d{4}-\d{2}-\d{2}$/.test(value)
                        ) {

                            const [year, month, day] =
                                value
                                    .split("-")
                                    .map(Number);

                            date =
                                new Date(
                                    year,
                                    month - 1,
                                    day
                                );

                        } else {

                            date =
                                typeof value.toDate === "function"
                                    ? value.toDate()
                                    : new Date(value);

                        }


                        if (Number.isNaN(date.getTime())) {
                            return String(value);
                        }


                        return new Intl.DateTimeFormat(
                            undefined,
                            {
                                year: "numeric",
                                month: "long",
                                day: "numeric"
                            }
                        ).format(date);

                    };

                document.getElementById(
                    "membershipStatus"
                ).textContent =
                    usesOwnerView
                        ? profileOwnerData.membershipStatus ||
                            "No Membership"
                        : getMemberFacingStatus(
                            profileOwnerData.membershipStatus
                        );


                document.getElementById(
                    "membershipSectionHeading"
                ).textContent =
                    usesOwnerView
                        ? "WBA Membership"
                        : "Membership Status";


                [
                    "membershipTypeDetail",
                    "memberIdDetail",
                    "memberSinceDetail",
                    "membershipCurrentThroughDetail"
                ].forEach((detailId) => {

                    document.getElementById(
                        detailId
                    ).style.display =
                        usesOwnerView
                            ? "flex"
                            : "none";

                });


                document.getElementById(
                    "membershipType"
                ).textContent =
                    profileOwnerData.membershipType ||
                    "—";


                document.getElementById(
                    "memberId"
                ).textContent =
                    profileOwnerData.memberId ||
                    profileOwnerData.memberNumber ||
                    "—";


                document.getElementById(
                    "memberSince"
                ).textContent =
                    formatMembershipDate(
                        profileOwnerData.membershipStartDate ||
                        profileOwnerData.memberSince
                    );


                document.getElementById(
                    "membershipCurrentThrough"
                ).textContent =
                    formatMembershipDate(
                        profileOwnerData.membershipCurrentThrough ||
                        profileOwnerData.renewalDate
                    );


                // -------------------------
                // Dog Sports & Activities
                // -------------------------

                const dogSportsSection =
                    document.getElementById(
                        "dogSportsSection"
                    );

                const profileDogSports =
                    document.getElementById(
                        "profileDogSports"
                    );

                const dogSportLabels =
                    Array.isArray(profileOwnerData.dogSports)
                        ? profileOwnerData.dogSports
                            .map((sportId) =>
                                DOG_SPORT_LABELS.get(sportId)
                            )
                            .filter(Boolean)
                        : [];


                profileDogSports.replaceChildren();


                if (dogSportLabels.length > 0) {

                    dogSportLabels.forEach((sportLabel) => {

                        const sportTag =
                            document.createElement("span");

                        sportTag.className =
                            "profile-sport-tag";

                        sportTag.textContent =
                            sportLabel;

                        profileDogSports.appendChild(
                            sportTag
                        );

                    });

                    dogSportsSection.style.display =
                        "block";

                } else if (usesOwnerView) {

                    const emptySportsMessage =
                        document.createElement("p");

                    emptySportsMessage.className =
                        "profile-muted";

                    emptySportsMessage.textContent =
                        "No Dog Sports & Activities added yet.";

                    profileDogSports.appendChild(
                        emptySportsMessage
                    );

                    dogSportsSection.style.display =
                        "block";

                } else {

                    dogSportsSection.style.display =
                        "none";

                }


                console.log(
                    "Member profile display loaded."
                );


            } catch (error) {

                console.error(error);


                profileMessage.textContent =
                    isOwner
                        ? isMemberPreview
                            ? "We couldn't load your member-facing profile preview."
                            : "We couldn't load your profile information."
                        : "We couldn't load this member profile.";

            }

        }
    );

}

// ------------------------------------
// Edit Profile
// ------------------------------------

const editProfileForm =
    document.getElementById("editProfileForm");


if (editProfileForm) {

    const editProfileMessage =
        document.getElementById(
            "editProfileMessage"
        );

        const profilePhotoInput =
    document.getElementById(
        "profilePhotoInput"
    );

const removeProfilePhotoButton =
    document.getElementById(
        "removeProfilePhotoButton"
    );

const profilePhotoMessage =
    document.getElementById(
        "profilePhotoMessage"
    );

const editProfilePhoto =
    document.getElementById(
        "editProfilePhoto"
    );

const editProfilePhotoPlaceholder =
    document.getElementById(
        "editProfilePhotoPlaceholder"
    );

const dogSportsCheckboxGrid =
    document.getElementById(
        "dogSportsCheckboxGrid"
    );

const requestSportButton =
    document.getElementById(
        "requestSportButton"
    );

const requestSportMessage =
    document.getElementById(
        "requestSportMessage"
    );

const editCountrySelect =
    document.getElementById("country");

const editSubdivisionSelect =
    document.getElementById("state");

let unmappedEditCountry = "";
let unmappedEditSubdivision = "";

populateCountrySelect(editCountrySelect);
populateSubdivisionSelect(editSubdivisionSelect, "");

editCountrySelect.addEventListener("change", () => {
    unmappedEditCountry = "";
    unmappedEditSubdivision = "";
    populateSubdivisionSelect(
        editSubdivisionSelect,
        editCountrySelect.value
    );
});


DOG_SPORT_OPTIONS.forEach((option) => {

    const checkboxLabel =
        document.createElement("label");

    checkboxLabel.className =
        "checkbox-option";

    const checkbox =
        document.createElement("input");

    checkbox.type =
        "checkbox";

    checkbox.name =
        "dogSports";

    checkbox.value =
        option.id;

    checkboxLabel.append(
        checkbox,
        document.createTextNode(option.label)
    );

    dogSportsCheckboxGrid.appendChild(
        checkboxLabel
    );

});


requestSportButton.addEventListener(
    "click",
    () => {

        requestSportMessage.textContent =
            "Request feature coming soon.";

    }
);

    onAuthStateChanged(
        auth,
        async (user) => {

            if (!user) {

                window.location.href =
                    "login.html";

                return;
            }


            if (!user.emailVerified) {

                window.location.href =
                    "login.html";

                return;
            }


            const userRef =
    doc(db, "users", user.uid);


let userData;

let profilePhotoMarkedForRemoval =
    false;


try {

                const userSnapshot =
                    await getDoc(userRef);


                if (!userSnapshot.exists()) {

                    editProfileMessage.textContent =
                        "We couldn't find your profile.";

                    return;
                }


                userData =
                    userSnapshot.data();

                    // -------------------------
                    // Profile Photo Initials
                    // -------------------------

const editInitials =
    `${(userData.firstName || "").charAt(0)}${(userData.lastName || "").charAt(0)}`
        .toUpperCase();

document.getElementById(
    "editProfileInitials"
).textContent =
    editInitials || "WBA";


if (userData.profilePhotoPath) {

    try {

        const photoRef =
            ref(
                storage,
                userData.profilePhotoPath
            );

        const photoURL =
            new URL(
                await getDownloadURL(photoRef)
            );


        if (userData.profilePhotoUpdatedAt) {

            photoURL.searchParams.set(
                "updatedAt",
                userData.profilePhotoUpdatedAt
            );

        }


        editProfilePhoto.onerror = () => {

            editProfilePhoto.style.display =
                "none";

            editProfilePhotoPlaceholder.style.display =
                "flex";

            removeProfilePhotoButton.style.display =
                "none";

        };


        editProfilePhoto.src =
            photoURL.toString();

        editProfilePhoto.style.display =
            "block";

        editProfilePhotoPlaceholder.style.display =
            "none";

        removeProfilePhotoButton.style.display =
            "inline-block";

    } catch (error) {

        console.error(
            "Profile photo could not be loaded for editing.",
            error
        );

        editProfilePhoto.style.display =
            "none";

        editProfilePhotoPlaceholder.style.display =
            "flex";

        removeProfilePhotoButton.style.display =
            "none";

    }

}

                // -------------------------
                // Load existing information
                // -------------------------

                document.getElementById(
                    "firstName"
                ).value =
                    userData.firstName || "";


                document.getElementById(
                    "lastName"
                ).value =
                    userData.lastName || "";


                document.getElementById(
                    "preferredName"
                ).value =
                    userData.preferredName || "";


                document.getElementById(
                    "email"
                ).value =
                    user.email || "";


                document.getElementById(
                    "phone"
                ).value =
                    userData.phone || "";


                document.getElementById(
                    "address"
                ).value =
                    userData.address || "";


                document.getElementById(
                    "city"
                ).value =
                    userData.city || "";


                document.getElementById(
                    "zip"
                ).value =
                    userData.zip || "";


                const resolvedCountry = resolveCountry(
                    userData.countryCode,
                    userData.countryName || userData.country
                );
                unmappedEditCountry = resolvedCountry
                    ? ""
                    : userData.countryName || userData.country || "";

                populateCountrySelect(
                    editCountrySelect,
                    resolvedCountry?.code || ""
                );

                const resolvedSubdivision = resolveSubdivision(
                    resolvedCountry,
                    userData.subdivisionCode,
                    userData.subdivisionName || userData.state
                );
                unmappedEditSubdivision = resolvedSubdivision
                    ? ""
                    : userData.subdivisionName || userData.state || "";

                populateSubdivisionSelect(
                    editSubdivisionSelect,
                    resolvedCountry?.code || "",
                    resolvedSubdivision?.code || ""
                );


                document.getElementById(
                    "about"
                ).value =
                    userData.about || "";

                    document.getElementById(
    "emailVisibility"
).value =
    userData.privacy?.email || "private";


document.getElementById(
    "phoneVisibility"
).value =
    userData.privacy?.phone || "private";


document.getElementById(
    "locationVisibility"
).value =
    userData.privacy?.location || "state";


document.getElementById(
    "aboutVisibility"
).value =
    userData.privacy?.about || "members";


document.getElementById(
    "preferredNameVisibility"
).value =
    userData.privacy?.preferredName || "members";


const savedDogSports =
    new Set(
        Array.isArray(userData.dogSports)
            ? userData.dogSports
            : []
    );


dogSportsCheckboxGrid
    .querySelectorAll(
        'input[name="dogSports"]'
    )
    .forEach((checkbox) => {

        checkbox.checked =
            savedDogSports.has(checkbox.value);

    });




                console.log(
                    "Edit Profile information loaded."
                );


            } catch (error) {

                console.error(error);


                editProfileMessage.textContent =
                    "We couldn't load your profile information.";

                return;
            }

// -------------------------
// Profile Photo Preview
// -------------------------

profilePhotoInput.addEventListener(
    "change",
    () => {

        const file =
            profilePhotoInput.files[0];

        profilePhotoMessage.textContent =
            "";

        if (!file) {
            return;
        }


        // Make sure it is an image

        if (!file.type.startsWith("image/")) {

            profilePhotoMessage.textContent =
                "Please choose an image file.";

            profilePhotoInput.value =
                "";

            return;
        }


        // Maximum size: 5 MB

        if (file.size > 5 * 1024 * 1024) {

            profilePhotoMessage.textContent =
                "Profile photos must be smaller than 5 MB.";

            profilePhotoInput.value =
                "";

            return;
        }


        profilePhotoMarkedForRemoval =
            false;


        // Create local preview

        const previewURL =
            URL.createObjectURL(file);


        editProfilePhoto.src =
            previewURL;

        editProfilePhoto.style.display =
            "block";

        editProfilePhotoPlaceholder.style.display =
            "none";

        removeProfilePhotoButton.style.display =
            "inline-block";


        profilePhotoMessage.textContent =
            "Photo selected. It will be saved when you save your changes.";

    }
);


// -------------------------
// Mark Profile Photo for Removal
// -------------------------

removeProfilePhotoButton.addEventListener(
    "click",
    () => {

        profilePhotoMarkedForRemoval =
            true;

        profilePhotoInput.value =
            "";

        editProfilePhoto.removeAttribute(
            "src"
        );

        editProfilePhoto.style.display =
            "none";

        editProfilePhotoPlaceholder.style.display =
            "flex";

        removeProfilePhotoButton.style.display =
            "none";

        profilePhotoMessage.textContent =
            "Photo will be removed when you save your changes.";

    }
);

            // -------------------------
            // Save changes
            // -------------------------

            editProfileForm.addEventListener(
                "submit",
                async (event) => {

                    event.preventDefault();


                    editProfileMessage.textContent =
                        "Saving...";


                    try {

    let profilePhotoPath =
        userData.profilePhotoPath || null;


    // --------------------------------
    // Upload selected profile photo
    // --------------------------------

    const selectedPhoto =
        profilePhotoInput.files[0];


    if (
        profilePhotoMarkedForRemoval &&
        !selectedPhoto &&
        profilePhotoPath
    ) {

        const existingPhotoRef =
            ref(
                storage,
                profilePhotoPath
            );


        try {

            await deleteObject(
                existingPhotoRef
            );

        } catch (error) {

            if (
                error.code !==
                "storage/object-not-found"
            ) {

                throw error;

            }

        }


        profilePhotoPath =
            null;

    }


    if (selectedPhoto) {

        if (!selectedPhoto.type.startsWith("image/")) {

            editProfileMessage.textContent =
                "Please choose a valid image file.";

            return;
        }


        if (selectedPhoto.size > 5 * 1024 * 1024) {

            editProfileMessage.textContent =
                "Profile photos must be smaller than 5 MB.";

            return;
        }


        profilePhotoPath =
            `profilePhotos/${user.uid}/profilePhoto`;


        const photoRef =
            ref(
                storage,
                profilePhotoPath
            );


        await uploadBytes(
            photoRef,
            selectedPhoto,
            {
                contentType:
                    selectedPhoto.type
            }
        );

    }


    // --------------------------------
    // Save profile information
    // --------------------------------

    const selectedCountry =
        getCountry(editCountrySelect.value);

    const selectedSubdivision =
        selectedCountry?.subdivisions.find(
            (subdivision) =>
                subdivision.code === editSubdivisionSelect.value
        ) || null;

    const profileData = {

        firstName:
            document
                .getElementById(
                    "firstName"
                )
                .value
                .trim(),


        lastName:
            document
                .getElementById(
                    "lastName"
                )
                .value
                .trim(),


        preferredName:
            document
                .getElementById(
                    "preferredName"
                )
                .value
                .trim(),


        phone:
            document
                .getElementById(
                    "phone"
                )
                .value
                .trim(),


        address:
            document
                .getElementById(
                    "address"
                )
                .value
                .trim(),


        city:
            document
                .getElementById(
                    "city"
                )
                .value
                .trim(),


        countryCode:
            selectedCountry?.code || "",

        countryName:
            selectedCountry?.name || "",

        subdivisionCode:
            selectedSubdivision?.code || "",

        subdivisionName:
            selectedSubdivision?.name || "",

        // Readable aliases remain temporarily for legacy consumers.
        state:
            selectedSubdivision?.name || unmappedEditSubdivision,


        zip:
            document
                .getElementById(
                    "zip"
                )
                .value
                .trim(),


        country:
            selectedCountry?.name || unmappedEditCountry,


        about:
            document
                .getElementById(
                    "about"
                )
                .value
                .trim(),


        dogSports:
            Array.from(
                dogSportsCheckboxGrid.querySelectorAll(
                    'input[name="dogSports"]:checked'
                )
            )
                .map((checkbox) => checkbox.value)
                .filter((sportId) =>
                    DOG_SPORT_IDS.has(sportId)
                ),


        privacy: {

            preferredName:
                document.getElementById(
                    "preferredNameVisibility"
                ).value,

            email:
                document.getElementById(
                    "emailVisibility"
                ).value,

            phone:
                document.getElementById(
                    "phoneVisibility"
                ).value,

            location:
                document.getElementById(
                    "locationVisibility"
                ).value,

            about:
                document.getElementById(
                    "aboutVisibility"
                ).value

        },


        profileCompleted:
            true,


        updatedAt:
            new Date().toISOString()

    };


    // If the member selected a photo,
    // save its Storage path in Firestore.

    if (
        profilePhotoMarkedForRemoval &&
        !selectedPhoto
    ) {

        profileData.profilePhotoPath =
            deleteField();

        profileData.profilePhotoUpdatedAt =
            deleteField();

    } else if (profilePhotoPath) {

        profileData.profilePhotoPath =
            profilePhotoPath;

        if (selectedPhoto) {

            profileData.profilePhotoUpdatedAt =
                new Date().toISOString();

        }

    }


    const profilePhotoUpdatedAt =
        selectedPhoto
            ? profileData.profilePhotoUpdatedAt
            : userData.profilePhotoUpdatedAt;

    const memberProfileRef =
        doc(
            db,
            "memberProfiles",
            user.uid
        );
    const existingMemberProfileSnapshot = await getDoc(memberProfileRef);
    const existingPortalRole = existingMemberProfileSnapshot.exists()
        ? existingMemberProfileSnapshot.data().portalRole
        : "";

    const memberProfileSourceData = {
        ...userData,
        ...profileData,
        ...(existingPortalRole === "admin" || existingPortalRole === "moderator"
            ? {portalRole: existingPortalRole}
            : {}),
        email:
            user.email ||
            userData.email ||
            "",
        profilePhotoPath:
            profilePhotoPath || null,
        profilePhotoUpdatedAt:
            profilePhotoPath
                ? profilePhotoUpdatedAt
                : null
    };

    const memberProfileData =
        buildMemberProfileData(
            user.uid,
            memberProfileSourceData
        );

    const profileWriteBatch =
        writeBatch(db);


    profileWriteBatch.set(
        userRef,
        profileData,
        {
            merge: true
        }
    );

    // Replace the sanitized document so fields that
    // are now private cannot remain from an earlier save.
    profileWriteBatch.set(
        memberProfileRef,
        memberProfileData
    );


    await profileWriteBatch.commit();


    editProfileMessage.textContent =
        "Your profile has been saved successfully.";


    console.log(
        "Edit Profile changes saved."
    );


    setTimeout(
        () => {

            window.location.href =
                "profile.html";

        },
        700
    );


                    } catch (error) {

                        console.error(error);

                        editProfileMessage.textContent =
                            "We couldn't save your profile. Please try again.";

                    }

                }
            );

        }
    );

}


// ------------------------------------
// Log Out
// ------------------------------------

const logoutButton =
    document.getElementById("logoutButton");


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async () => {

            try {

                await signOut(auth);

                window.location.href =
                    "index.html";

            } catch (error) {

                console.error(error);

            }

        }
    );

}
