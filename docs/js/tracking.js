let currentUser = null;

$(document).ready(async function() {
    await checkSession();

    // --- Navigation & UI ---
    $('#btn-open-add-modal').click(function() {
        resetModal();
        $('#tracking-modal').addClass('active');
    });

    $('#close-modal').click(function() {
        $('#tracking-modal').removeClass('active');
    });

    $(document).on('click', '#avatar-btn', function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $('#menu-btn-logout').click(function(e) {
        e.preventDefault();
        handleLogout();
    });

    // --- Save Logic ---
    $('#btn-save').click(function() {
        saveTracking();
    });

    $(document).on('click', '.btn-edit', function() {
        const data = $(this).data('item');
        editTracking(data);
    });

    $(document).on('click', '.btn-delete', function() {
        const id = $(this).data('id');
        deleteTracking(id);
    });

    $(document).on('click', '.copy-btn', function() {
        const text = $(this).data('guia');
        copyToClipboard(text);
    });
});

async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: user } = await _supabase
            .from('usuarios')
            .select('id, username')
            .eq('id', session.user.id)
            .single();

        if (user) {
            currentUser = user;
            $('#dropdown-user-name').text(user.username);
            $('#top-panel, #authenticated-content').show();
            loadTracking();
        } else {
            window.location.href = 'admin.html';
        }
    } else {
        window.location.href = 'admin.html';
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'admin.html';
}

async function loadTracking() {
    $('#tracking-list').html('<tr><td colspan="6" class="loading">Cargando datos...</td></tr>');

    const { data: items, error } = await _supabase
        .from('tracking')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        $('#tracking-list').html('<tr><td colspan="6" class="error">Error al cargar datos.</td></tr>');
        console.error(error);
        return;
    }

    if (!items || items.length === 0) {
        $('#tracking-list').html('<tr><td colspan="6" class="empty">No tienes registros de tracking.</td></tr>');
        return;
    }

    const $container = $('#tracking-list');
    $container.empty();

    items.forEach(item => {
        const statusClass = `status-${item.status.toLowerCase()}`;
        const $row = $(`
            <tr>
                <td>
                    <strong>${item.guia}</strong>
                    <button class="copy-btn" data-guia="${item.guia}" title="Copiar Guía"><i class="fas fa-copy"></i></button>
                </td>
                <td>${item.paqueteria}</td>
                <td>
                    <div style="font-weight:bold;">${item.nombre_cliente}</div>
                    <div style="font-size:11px; color:#aaa;">${item.telefono || ''}</div>
                </td>
                <td>
                    <div style="font-size:12px;">🛫 ${item.fecha_envio || '-'}</div>
                    <div style="font-size:12px;">🛬 ${item.fecha_llegada || '-'}</div>
                </td>
                <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-secondary btn-sm btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm btn-delete" data-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `);

        $row.find('.btn-edit').data('item', item);
        $container.append($row);
    });
}

async function saveTracking() {
    const id = $('#edit-id').val();
    const guia = $('#input-guia').val().trim();
    const paqueteria = $('#input-paqueteria').val().trim();
    const cliente = $('#input-cliente').val().trim();
    const telefono = $('#input-telefono').val().trim();
    const ubicacion = $('#input-ubicacion').val().trim();
    const detalles = $('#input-detalles').val().trim();
    const fechaEnvio = $('#input-fecha-envio').val();
    const fechaLlegada = $('#input-fecha-llegada').val();
    const status = $('#input-status').val();

    if (!guia || !cliente) {
        Swal.fire('Atención', 'El número de guía y el nombre del cliente son obligatorios', 'warning');
        return;
    }

    const data = {
        user_id: currentUser.id,
        guia,
        paqueteria,
        nombre_cliente: cliente,
        telefono,
        ubicacion,
        detalles_pedido: detalles,
        fecha_envio: fechaEnvio || null,
        fecha_llegada: fechaLlegada || null,
        status
    };

    let error;
    if (id) {
        const result = await _supabase.from('tracking').update(data).eq('id', id);
        error = result.error;
    } else {
        const result = await _supabase.from('tracking').insert([data]);
        error = result.error;
    }

    if (error) {
        Swal.fire('Error', 'No se pudo guardar el registro: ' + error.message, 'error');
    } else {
        Swal.fire('Guardado', 'Registro actualizado correctamente', 'success');
        $('#tracking-modal').removeClass('active');
        loadTracking();
    }
}

function editTracking(item) {
    resetModal();
    $('#modal-title').text('Editar Guía');
    $('#edit-id').val(item.id);
    $('#input-guia').val(item.guia);
    $('#input-paqueteria').val(item.paqueteria);
    $('#input-cliente').val(item.nombre_cliente);
    $('#input-telefono').val(item.telefono);
    $('#input-ubicacion').val(item.ubicacion);
    $('#input-detalles').val(item.detalles_pedido);
    $('#input-fecha-envio').val(item.fecha_envio);
    $('#input-fecha-llegada').val(item.fecha_llegada);
    $('#input-status').val(item.status);

    $('#tracking-modal').addClass('active');
}

async function deleteTracking(id) {
    const result = await Swal.fire({
        title: '¿Eliminar registro?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('tracking').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el registro', 'error');
        } else {
            loadTracking();
        }
    }
}

function resetModal() {
    $('#modal-title').text('Añadir Guía');
    $('#edit-id').val('');
    $('#input-guia').val('');
    $('#input-paqueteria').val('');
    $('#input-cliente').val('');
    $('#input-telefono').val('');
    $('#input-ubicacion').val('');
    $('#input-detalles').val('');
    $('#input-fecha-envio').val('');
    $('#input-fecha-llegada').val('');
    $('#input-status').val('Pendiente');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({
            title: '¡Copiado!',
            text: 'Número de guía copiado al portapapeles',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });
    });
}
