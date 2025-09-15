import { Pool } from 'pg';

// Configuración de la conexión a PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(req, res) {
  // Solo permitir métodos GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const client = await pool.connect();

  try {
    // Obtener parámetros de la consulta
    const { period = 'month', limit = 100, offset = 0 } = req.query;

    // Definir condiciones de período
    const periodConditions = {
      today: "s.date >= CURRENT_DATE",
      week: "s.date >= date_trunc('week', CURRENT_DATE)",
      month: "s.date >= date_trunc('month', CURRENT_DATE)",
      quarter: "s.date >= date_trunc('quarter', CURRENT_DATE)",
      year: "s.date >= date_trunc('year', CURRENT_DATE)",
      all: "1=1" // Sin filtro de fecha
    };

    // Validar período
    if (!periodConditions[period]) {
      return res.status(400).json({
        success: false,
        error: 'Período inválido. Opciones: today, week, month, quarter, year, all'
      });
    }

    // Consulta principal para obtener historial de ventas
    const salesQuery = `
      SELECT 
        s.id,
        s.date,
        s.subtotal,
        s.tax,
        s.total,
        s.payment_method,
        s.amount_paid,
        s.change,
        s.ncf,
        COALESCE(c.name, 'Cliente General') as customer_name,
        c.cedula as customer_cedula,
        c.phone as customer_phone,
        u.username as seller_username,
        u.first_name as seller_first_name,
        u.last_name as seller_last_name,
        (
          SELECT COUNT(*) 
          FROM sale_items si 
          WHERE si.sale_id = s.id
        ) as items_count,
        (
          SELECT STRING_AGG(
            CONCAT(si.quantity, 'x ', si.product_name), 
            ', ' 
            ORDER BY si.id
          )
          FROM sale_items si 
          WHERE si.sale_id = s.id
          LIMIT 3
        ) as items_preview
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE ${periodConditions[period]}
      ORDER BY s.date DESC, s.id DESC
      LIMIT $1 OFFSET $2
    `;

    // Consulta para contar total de registros
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM sales s
      WHERE ${periodConditions[period]}
    `;

    // Ejecutar consultas
    const salesResult = await client.query(salesQuery, [parseInt(limit), parseInt(offset)]);
    const countResult = await client.query(countQuery);

    // Consulta para estadísticas del período
    const statsQuery = `
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_amount,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(AVG(total), 0) as avg_sale,
        MIN(total) as min_sale,
        MAX(total) as max_sale,
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_payments,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_payments,
        COUNT(CASE WHEN payment_method = 'transfer' THEN 1 END) as transfer_payments
      FROM sales s
      WHERE ${periodConditions[period]}
    `;

    const statsResult = await client.query(statsQuery);

    // Formatear datos de ventas
    const sales = salesResult.rows.map(sale => ({
      id: sale.id,
      date: sale.date,
      subtotal: parseFloat(sale.subtotal),
      tax: parseFloat(sale.tax),
      total: parseFloat(sale.total),
      payment_method: sale.payment_method,
      amount_paid: parseFloat(sale.amount_paid || 0),
      change: parseFloat(sale.change || 0),
      ncf: sale.ncf,
      customer: {
        name: sale.customer_name,
        cedula: sale.customer_cedula,
        phone: sale.customer_phone
      },
      seller: {
        username: sale.seller_username,
        name: `${sale.seller_first_name || ''} ${sale.seller_last_name || ''}`.trim() || sale.seller_username
      },
      items_count: parseInt(sale.items_count),
      items_preview: sale.items_preview,
      formatted_date: new Date(sale.date).toLocaleString('es-DO'),
      formatted_total: `RD$${parseFloat(sale.total).toLocaleString('es-DO', {minimumFractionDigits: 2})}`
    }));

    // Formatear estadísticas
    const stats = statsResult.rows[0];
    const periodStats = {
      total_sales: parseInt(stats.total_sales),
      total_amount: parseFloat(stats.total_amount),
      total_tax: parseFloat(stats.total_tax),
      avg_sale: parseFloat(stats.avg_sale),
      min_sale: parseFloat(stats.min_sale || 0),
      max_sale: parseFloat(stats.max_sale || 0),
      unique_customers: parseInt(stats.unique_customers),
      payment_methods: {
        cash: parseInt(stats.cash_payments),
        card: parseInt(stats.card_payments),
        transfer: parseInt(stats.transfer_payments)
      }
    };

    // Respuesta
    const response = {
      success: true,
      data: {
        sales: sales,
        pagination: {
          total_count: parseInt(countResult.rows[0].total_count),
          current_page: Math.floor(offset / limit) + 1,
          per_page: parseInt(limit),
          total_pages: Math.ceil(countResult.rows[0].total_count / limit)
        },
        period: period,
        stats: periodStats
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error en sales-history:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor',
      message: error.message 
    });
  } finally {
    client.release();
  }
}