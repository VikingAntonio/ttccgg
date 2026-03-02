let currentUser = null;

$(document).ready(async function() {
    await checkSession();

    // --- Navigation & UI ---
    $('#btn-open-add-modal').click(function() {
        resetModal();
        $('#auction-modal').addClass('active');
    });

    $('#close-modal').click(function() {
        $('#auction-modal').removeClass('active');
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
        saveAuction();
    });

    $(document).on('click', '.btn-edit', function() {
        const data = $(this).data('item');
        editAuction(data);
    });

    $(document).on('click', '.btn-delete', function() {
        const id = $(this).data('id');
        deleteAuction(id);
    });

    $(document).on('click', '.btn-pdf', function() {
        const data = $(this).data('item');
        generatePDF(data);
    });
});

async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: user } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, role, max_auctions_count')
            .eq('id', session.user.id)
            .single();

        if (user) {
            currentUser = user;
            $('#dropdown-user-name').text(user.username);
            $('#top-panel, #authenticated-content').show();

            // Set store data in template
            $('#tpl-store-name').text(user.store_name || user.username);
            $('.tpl-store-name-inline').text(user.store_name || user.username);

            // Starter users only see their name, no logo
            if (user.store_logo && user.role !== 'starter') {
                $('#tpl-logo').attr('src', user.store_logo).show();
            } else {
                $('#tpl-logo').hide();
            }

            loadAuctions();
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

async function loadAuctions() {
    $('#auction-list').html('<tr><td colspan="6" class="loading">Cargando datos...</td></tr>');

    const { data: items, error } = await _supabase
        .from('subastas')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        $('#auction-list').html('<tr><td colspan="6" class="error">Error al cargar datos.</td></tr>');
        console.error(error);
        return;
    }

    if (!items || items.length === 0) {
        $('#auction-list').html('<tr><td colspan="6" class="empty">No tienes subastas registradas.</td></tr>');
        return;
    }

    const $container = $('#auction-list');
    $container.empty();

    items.forEach(item => {
        const $row = $(`
            <tr>
                <td><strong>${item.nombre}</strong></td>
                <td style="font-size: 13px; color: #aaa;">${item.detalles ? (item.detalles.length > 50 ? item.detalles.substring(0, 50) + '...' : item.detalles) : '-'}</td>
                <td style="color: #6c5ce7; font-weight: bold;">${item.precio_total}</td>
                <td>${item.dia_entrega || '-'}</td>
                <td><span class="status-badge">${item.status}</span></td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-pdf btn-sm" title="Generar PDF"><i class="fas fa-file-pdf"></i></button>
                        <button class="btn btn-secondary btn-sm btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm btn-delete" data-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `);

        $row.find('.btn-edit, .btn-pdf').data('item', item);
        $container.append($row);
    });
}

async function saveAuction() {
    const id = $('#edit-id').val();

    // Limit check for new auctions
    if (!id) {
        const { count, error: countError } = await _supabase
            .from('subastas')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (!countError) {
            const limit = currentUser.max_auctions_count || 3;
            if (count >= limit) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Has alcanzado el límite de ${limit} subastas registradas.`,
                    icon: 'warning',
                    footer: '<a href="admin.html">Sube a Premium para aumentar tu límite</a>'
                });
                return;
            }
        }
    }

    const nombre = $('#input-nombre').val().trim();
    const detalles = $('#input-detalles').val().trim();
    const total = $('#input-total').val().trim();
    const entrega = $('#input-entrega').val().trim();
    const status = $('#input-status').val();

    if (!nombre || !total) {
        Swal.fire('Atención', 'El nombre y el precio final son obligatorios', 'warning');
        return;
    }

    const data = {
        user_id: currentUser.id,
        nombre,
        detalles,
        precio_total: total,
        dia_entrega: entrega,
        status
    };

    let error;
    if (id) {
        const result = await _supabase.from('subastas').update(data).eq('id', id);
        error = result.error;
    } else {
        const result = await _supabase.from('subastas').insert([data]);
        error = result.error;
    }

    if (error) {
        Swal.fire('Error', 'No se pudo guardar el registro: ' + error.message, 'error');
    } else {
        Swal.fire('Guardado', 'Subasta actualizada correctamente', 'success');
        $('#auction-modal').removeClass('active');
        loadAuctions();
    }
}

function editAuction(item) {
    resetModal();
    $('#modal-title').text('Editar Subasta');
    $('#edit-id').val(item.id);
    $('#input-nombre').val(item.nombre);
    $('#input-detalles').val(item.detalles);
    $('#input-total').val(item.precio_total);
    $('#input-entrega').val(item.dia_entrega);
    $('#input-status').val(item.status);

    $('#auction-modal').addClass('active');
}

async function deleteAuction(id) {
    const result = await Swal.fire({
        title: '¿Eliminar registro?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('subastas').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el registro', 'error');
        } else {
            loadAuctions();
        }
    }
}

function resetModal() {
    $('#modal-title').text('Añadir Subasta');
    $('#edit-id').val('');
    $('#input-nombre').val('');
    $('#input-detalles').val('');
    $('#input-total').val('');
    $('#input-entrega').val('');
    $('#input-status').val('Pendiente');
}

async function generatePDF(item) {
    Swal.fire({
        title: 'Generando PDF...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // Populate Template
    $('#tpl-nombre').text(item.nombre);
    $('#tpl-fecha').text(new Date(item.created_at).toLocaleDateString());
    $('#tpl-detalles').text(item.detalles || 'Sin detalles');
    $('#tpl-total').text(item.precio_total);
    $('#tpl-entrega').text(item.dia_entrega || 'Por definir');

    const template = document.getElementById('pdf-template');

    try {
        const canvas = await html2canvas(template, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Subasta_${item.nombre.replace(/\s+/g, '_')}.pdf`);

        Swal.fire('¡Éxito!', 'PDF generado correctamente', 'success');
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    }
}
