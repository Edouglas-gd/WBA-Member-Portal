import {
    firebaseApp,
    db,
    storage
} from "./firebase-config.js";

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
    getDoc,
    deleteField
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";


const auth = getAuth(firebaseApp);


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


            try {

                const userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                await sendEmailVerification(
                    userCredential.user
                );


                message.textContent =
                    "Your account has been created. Please check your email to verify your account.";


                createAccountForm.reset();


            } catch (error) {

                console.error(error);


                message.textContent =
                    "We couldn't create your account. Please check your information and try again.";

            }

        }
    );

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


                const userRef =
                    doc(db, "users", user.uid);


                const userSnapshot =
                    await getDoc(userRef);


                if (!userSnapshot.exists()) {

                    await setDoc(
                        userRef,
                        {
                            email: user.email,
                            profileCompleted: false,
                            createdAt:
                                new Date().toISOString()
                        }
                    );


                    console.log(
                        "New user profile created in Firestore."
                    );


                    window.location.href =
                        "profile.html";


                    return;

                }


                console.log(
                    "Existing user profile found in Firestore."
                );


                window.location.href =
    "profile.html";

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

                    await sendEmailVerification(user);


                    message.textContent =
                        "A new verification email has been sent. Please check your email.";

                } catch (error) {

                    console.error(error);


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


            try {

                const userSnapshot =
                    await getDoc(userRef);


                if (!userSnapshot.exists()) {

                    profileMessage.textContent =
                        "We couldn't find your profile.";

                    return;

                }


                const userData =
                    userSnapshot.data();

                const privacy =
                    userData.privacy || {};

                // -------------------------
                // Name
                // -------------------------

                const firstName =
                    userData.firstName || "";

                const lastName =
                    userData.lastName || "";

                const preferredName =
                    userData.preferredName || "";


                const displayFirstName =
                    preferredName || firstName;


                const displayName =
                    `${displayFirstName} ${lastName}`.trim();


                document.getElementById(
                    "profileDisplayName"
                ).textContent =
                    displayName || "WBA Member";


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

                if (userData.profilePhotoPath) {

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

const address =
    userData.address || "";

const city =
    userData.city || "";

const state =
    userData.state || "";

const zip =
    userData.zip || "";

const country =
    userData.country || "";


const locationVisibility =
    privacy.location || "state";


let profileLocation = "";


switch (locationVisibility) {

    case "full":

        profileLocation =
            [
                address,
                city,
                state,
                zip,
                country
            ]
                .filter(Boolean)
                .join(", ");

        break;


    case "cityState":

        profileLocation =
            [
                city,
                state
            ]
                .filter(Boolean)
                .join(", ");

        break;


    case "state":

        profileLocation =
            state || country;

        break;


    case "country":

        profileLocation =
            country;

        break;


    case "private":

        profileLocation =
            "Private";

        break;


    default:

        profileLocation =
            state || country;

}


document.getElementById(
    "profileLocation"
).textContent =
    profileLocation;


document.getElementById(
    "profileFullLocation"
).textContent =
    profileLocation || "Not provided";


// -------------------------
// Contact
// -------------------------

const emailVisibility =
    privacy.email || "private";

const phoneVisibility =
    privacy.phone || "private";


if (emailVisibility === "members") {

    document.getElementById(
        "profileEmail"
    ).textContent =
        user.email || "Not provided";

} else {

    document.getElementById(
        "profileEmail"
    ).textContent =
        "Private";

}


if (phoneVisibility === "members") {

    document.getElementById(
        "profilePhone"
    ).textContent =
        userData.phone || "Not provided";

} else {

    document.getElementById(
        "profilePhone"
    ).textContent =
        "Private";

}
// -------------------------
// About
// -------------------------

const aboutVisibility =
    privacy.about || "members";


if (
    aboutVisibility === "members" &&
    userData.about
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        userData.about;

    document.getElementById(
        "profileAbout"
    ).classList.remove(
        "profile-muted"
    );

} else if (
    aboutVisibility === "private"
) {

    document.getElementById(
        "profileAbout"
    ).textContent =
        "Private";

}


                // -------------------------
                // Membership Information
                // -------------------------

                document.getElementById(
                    "membershipStatus"
                ).textContent =
                    userData.membershipStatus ||
                    "No Membership";


                document.getElementById(
                    "membershipType"
                ).textContent =
                    userData.membershipType ||
                    "—";


                document.getElementById(
                    "memberNumber"
                ).textContent =
                    userData.memberNumber ||
                    "—";


                document.getElementById(
                    "memberSince"
                ).textContent =
                    userData.memberSince ||
                    "—";


                console.log(
                    "Member profile display loaded."
                );


            } catch (error) {

                console.error(error);


                profileMessage.textContent =
                    "We couldn't load your profile information.";

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
                    "state"
                ).value =
                    userData.state || "";


                document.getElementById(
                    "zip"
                ).value =
                    userData.zip || "";


                document.getElementById(
                    "country"
                ).value =
                    userData.country || "";


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


        state:
            document
                .getElementById(
                    "state"
                )
                .value
                .trim(),


        zip:
            document
                .getElementById(
                    "zip"
                )
                .value
                .trim(),


        country:
            document
                .getElementById(
                    "country"
                )
                .value
                .trim(),


        about:
            document
                .getElementById(
                    "about"
                )
                .value
                .trim(),


        privacy: {

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


    await setDoc(
        userRef,
        profileData,
        {
            merge: true
        }
    );


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
