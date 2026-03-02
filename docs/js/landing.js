$(document).ready(async function() {
    await checkSession();
    initTheme();
    loadStoresSlider();
    updateCartCount();

    // --- Auth Modal Toggling ---
    $('#btn-open-auth, #btn-cta-register').click(function(e) {
        e.preventDefault();
        $('#auth-modal').addClass('active');
        if ($(this).attr('id') === 'btn-cta-register') {
            showRegister();
        } else {
            showLogin();
        }
    });

    $('#close-auth-modal, #auth-modal').click(function(e) {
        if (e.target === this || $(e.target).attr('id') === 'close-auth-modal') {
            $('#auth-modal').removeClass('active');
        }
    });

    $('#link-show-register').click(function(e) {
        e.preventDefault();
        showRegister();
    });

    $('#link-show-login, #link-forgot-to-login').click(function(e) {
        e.preventDefault();
        showLogin();
    });

    $('#link-show-forgot').click(function(e) {
        e.preventDefault();
        showForgot();
    });

    function showLogin() {
        $('#register-view').hide();
        $('#forgot-view').hide();
        $('#login-view').show();
    }

    function showRegister() {
        $('#login-view').hide();
        $('#forgot-view').hide();
        $('#register-view').show();
    }

    function showForgot() {
        $('#login-view').hide();
        $('#register-view').hide();
        $('#forgot-view').show();
    }

    // --- Authentication ---
    $('#btn-login').click(handleLogin);
    $('#btn-register').click(handleRegister);
    $('#btn-forgot-password').click(handleForgotPassword);

    async function handleLogin() {
        const userInput = $('#login-username').val().trim();
        const password = $('#login-password').val().trim();

        if (!userInput || !password) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, completa todos los campos',
                icon: 'warning',
                position: 'top'
            });
            return;
        }

        let emailToUse = userInput;

        if (!userInput.includes('@')) {
            // Attempt to find the real email in the 'usuarios' table for existing accounts
            const { data: userRow } = await _supabase
                .from('usuarios')
                .select('email')
                .eq('username', userInput)
                .maybeSingle();

            if (userRow && userRow.email) {
                emailToUse = userRow.email;
            } else {
                // Fallback to our convention for new accounts
                emailToUse = `${userInput}@tcgdual.com`;
            }
        }

        const { data, error } = await _supabase.auth.signInWithPassword({
            email: emailToUse,
            password: password,
        });

        if (error) {
            Swal.fire({
                title: 'Error',
                text: 'Error al iniciar sesión: ' + error.message,
                icon: 'error',
                position: 'top'
            });
        } else {
            // After auth, fetch profile
            const { data: profile } = await _supabase
                .from('usuarios')
                .select('id, username, store_name, store_logo, is_store, role')
                .eq('id', data.user.id)
                .single();

            localStorage.setItem('tcg_session', JSON.stringify(profile));
            Swal.fire({
                title: '¡Bienvenido!',
                text: 'Has iniciado sesión correctamente',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                location.reload();
            });
        }
    }

    async function handleForgotPassword() {
        const userInput = $('#forgot-username').val().trim();

        if (!userInput) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, introduce tu nombre de usuario',
                icon: 'warning',
                position: 'top'
            });
            return;
        }

        let emailToUse = userInput;

        if (!userInput.includes('@')) {
            // Attempt to find the real email in the 'usuarios' table
            const { data: userRow } = await _supabase
                .from('usuarios')
                .select('email')
                .eq('username', userInput)
                .maybeSingle();

            if (userRow && userRow.email) {
                emailToUse = userRow.email;
            } else {
                // Fallback to our convention
                emailToUse = `${userInput}@tcgdual.com`;
            }
        }

        const { error } = await _supabase.auth.resetPasswordForEmail(emailToUse, {
            redirectTo: window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/perfil.html'),
        });

        if (error) {
            Swal.fire('Error', 'No se pudo enviar el correo de restablecimiento: ' + error.message, 'error');
        } else {
            Swal.fire({
                title: '¡Correo Enviado!',
                text: 'Revisa tu bandeja de entrada para restablecer tu contraseña.',
                icon: 'success'
            }).then(() => {
                showLogin();
            });
        }
    }

    async function handleRegister() {
        const email = $('#reg-email').val().trim();
        const username = $('#reg-username').val().trim();
        const password = $('#reg-password').val().trim();

        if (!email || !username || !password) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, completa todos los campos',
                icon: 'warning',
                position: 'top'
            });
            return;
        }

        const { data, error } = await _supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (error) {
            Swal.fire({
                title: 'Error',
                text: 'No se pudo crear la cuenta: ' + error.message,
                icon: 'error',
                position: 'top'
            });
        } else {
            Swal.fire({
                title: '¡Cuenta Creada!',
                text: 'Revisa tu correo para confirmar (si está activado) o inicia sesión ahora.',
                icon: 'success',
                timer: 3000,
                showConfirmButton: true,
                position: 'top'
            }).then(() => {
                location.reload();
            });
        }
    }

    // --- Session & Header ---
    async function checkSession() {
        const { data: { session } } = await _supabase.auth.getSession();
        const $authItems = $('#auth-menu-items');
        $authItems.empty();

        if (session) {
            const { data: user } = await _supabase
                .from('usuarios')
                .select('id, username, store_name, store_logo, is_store, role')
                .eq('id', session.user.id)
                .single();

            if (!user) return;
            localStorage.setItem('tcg_session', JSON.stringify(user));

            if (user.is_store) {
                $('#dropdown-user-logo').show().attr('src', user.store_logo || 'https://midominio.com/placeholder-logo.png');
                $('#dropdown-user-name').text(user.store_name || user.username);
                $('#dropdown-user-role').hide();
            } else {
                $('#dropdown-user-logo').hide();
                $('#dropdown-user-name').text(user.username);
                $('#dropdown-user-role').hide();
            }

            $authItems.append('<a href="admin.html" class="menu-item"><i class="fas fa-lock"></i> Panel Admin</a>');
            $authItems.append('<a href="#" class="menu-item logout" id="btn-logout"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a>');

            $('#btn-open-auth').text('Ir al Panel').attr('href', 'admin.html').attr('id', '');
        } else {
            $('#dropdown-user-name').text('Invitado');
            $('#dropdown-user-role').text('Invitado');
            $authItems.append('<a href="#" class="menu-item" id="btn-menu-login"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</a>');
        }
    }

    $(document).on('click', '#btn-logout', async function(e) {
        e.preventDefault();
        await _supabase.auth.signOut();
        localStorage.removeItem('tcg_session');
        location.reload();
    });

    $(document).on('click', '#btn-menu-login', function(e) {
        e.preventDefault();
        $('#auth-modal').addClass('active');
        showLogin();
        $('#user-dropdown').removeClass('active');
    });

    // --- Floating Panel Logic ---
    $('#avatar-btn').click(function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.user-menu-container').length) {
            $('#user-dropdown').removeClass('active');
        }
    });

    // --- Theme Logic ---
    function initTheme() {
        const savedTheme = localStorage.getItem('tcg_theme') || 'theme-dark';
        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        $('body').removeClass('theme-light theme-medium theme-dark').addClass(theme);
        localStorage.setItem('tcg_theme', theme);
        $('.theme-btn-small').removeClass('active');
        $(`.theme-btn-small[data-theme="${theme}"]`).addClass('active');
    }

    $('.theme-btn-small').click(function() {
        const theme = $(this).data('theme');
        applyTheme(theme);
    });

    // --- Slider Logic ---
    window.allStoresData = [];

    async function loadStoresSlider() {
        const $wrapper = $('#stores-slider-wrapper');
        $wrapper.html('<div class="loading">Cargando tiendas...</div>');

        const { data: stores, error } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, ubicacion, horario, is_store')
            .eq('is_store', true);

        if (error || !stores || stores.length === 0) {
            $wrapper.html('<div class="empty">Próximamente más tiendas.</div>');
            return;
        }

        window.allStoresData = stores;
        $wrapper.empty();
        stores.forEach(store => {
            const storeDisplay = store.store_name || store.username;
            const logoUrl = store.store_logo || 'https://midominio.com/placeholder-logo.png';

            const $slide = $(`
                <div class="swiper-slide">
                    <div class="store-slide" onclick="openBusinessModal('${store.username}')">
                        <div class="store-logo-circle">
                            ${store.store_logo
                                ? `<img src="${store.store_logo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                                : `<i class="fas fa-store" style="font-size: 3rem; color: var(--primary-color); display: flex; justify-content: center; align-items: center; height: 100%;"></i>`
                            }
                        </div>
                        <div class="store-name-slide">${storeDisplay}</div>
                        <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">@${store.username}</div>
                    </div>
                </div>
            `);
            $wrapper.append($slide);
        });

        new Swiper('.logos-swiper', {
            slidesPerView: 1,
            spaceBetween: 40,
            loop: stores.length >= 3,
            speed: 1000,
            grabCursor: true,
            centeredSlides: false,
            autoplay: {
                delay: 2500,
                disableOnInteraction: false,
                pauseOnMouseEnter: true
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true
            },
            breakpoints: {
                640: {
                    slidesPerView: 2,
                    spaceBetween: 30
                },
                1024: {
                    slidesPerView: 3,
                    spaceBetween: 50
                }
            }
        });
    }

    // --- Business Modal ---
    window.openBusinessModal = function(username) {
        const store = window.allStoresData.find(s => s.username === username);
        if (!store) return;

        const storeDisplay = store.store_name || store.username;
        $('#modal-business-name').text(storeDisplay);
        $('#modal-business-logo').attr('src', store.store_logo || 'https://midominio.com/placeholder-logo.png');
        $('#modal-business-address').text(store.ubicacion || 'Ubicación no disponible');
        $('#modal-business-hours').text(store.horario || 'Horario no disponible');

        const publicUrl = `public.html?store=${encodeURIComponent(storeDisplay)}`;
        $('#modal-business-link').attr('href', publicUrl);

        $('#business-modal').addClass('active');
    };

    window.closeBusinessModal = function() {
        $('#business-modal').removeClass('active');
    };

    $('#business-modal').click(function(e) {
        if (e.target === this) closeBusinessModal();
    });

    // --- Cart Logic ---
    function updateCartCount() {
        if (typeof Cart !== 'undefined') {
            $('#cart-count').text(Cart.getCount());
        }
    }
});
