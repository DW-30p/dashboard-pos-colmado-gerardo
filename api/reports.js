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
    // Obtener parámetros
    const { period = 'month', report_type = 'all' } = req.query;

    // Definir condiciones de período
    const periodConditions = {
      today: "date >= CURRENT_DATE",
      yesterday: "date >= CURRENT_DATE - INTERVAL '1 day' AND date < CURRENT_DATE",
      week: "date >= date_trunc('week', CURRENT_DATE)",
      month: "date >= date_trunc('month', CURRENT_DATE)",
      quarter: "date >= date_trunc('quarter', CURRENT_DATE)",
      year: "date >= date_trunc('year', CURRENT_DATE)"
    };

    const whereClause = periodConditions[period] || periodConditions.month;

    // 1. VENTAS Y GANANCIAS
    const salesFinancialQuery = `
      SELECT 
        -- Ventas generales
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(subtotal), 0) as subtotal_amount,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(AVG(total), 0) as avg_sale,
        
        -- Costos y ganancias
        COALESCE(SUM(
          (SELECT SUM(si.quantity * COALESCE(p.cost, 0))
           FROM sale_items si 
           JOIN products p ON si.product_id = p.id 
           WHERE si.sale_id = s.id)
        ), 0) as total_costs,
        
        -- Ventas por día de la semana
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 0 THEN 1 END) as sunday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 1 THEN 1 END) as monday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 2 THEN 1 END) as tuesday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 3 THEN 1 END) as wednesday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 4 THEN 1 END) as thursday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 5 THEN 1 END) as friday_sales,
        COUNT(CASE WHEN EXTRACT(DOW FROM date) = 6 THEN 1 END) as saturday_sales,
        
        -- Ventas por método de pago
        COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_sales,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_sales,
        COUNT(CASE WHEN payment_method = 'transfer' THEN 1 END) as transfer_sales,
        
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) as transfer_amount
        
      FROM sales s
      WHERE ${whereClause}
    `;

    // 2. PRODUCTOS POPULARES
    const topProductsQuery = `
      SELECT 
        p.id,
        p.name,
        p.price,
        p.cost,
        SUM(si.quantity) as total_sold,
        COUNT(DISTINCT si.sale_id) as times_sold,
        SUM(si.subtotal) as total_revenue,
        SUM(si.quantity * COALESCE(p.cost, 0)) as total_cost,
        (SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost, 0))) as total_profit,
        ROUND(AVG(si.unit_price), 2) as avg_selling_price,
        p.stock as current_stock
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.${whereClause}
      GROUP BY p.id, p.name, p.price, p.cost, p.stock
      ORDER BY total_sold DESC
      LIMIT 20
    `;

    // 3. VENTAS DIARIAS (últimos 30 días)
    const dailySalesQuery = `
      SELECT 
        DATE(date) as sale_date,
        COUNT(*) as sales_count,
        SUM(total) as daily_total,
        AVG(total) as daily_avg
      FROM sales
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(date)
      ORDER BY sale_date DESC
      LIMIT 30
    `;

    // 4. CLIENTES TOP
    const topCustomersQuery = `
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.email,
        COUNT(s.id) as total_purchases,
        SUM(s.total) as total_spent,
        AVG(s.total) as avg_purchase,
        MAX(s.date) as last_purchase
      FROM customers c
      JOIN sales s ON c.id = s.customer_id
      WHERE s.${whereClause}
      GROUP BY c.id, c.name, c.phone, c.email
      ORDER BY total_spent DESC
      LIMIT 10
    `;

    // 5. PRODUCTOS CON STOCK BAJO
    const lowStockQuery = `
      SELECT 
        id,
        name,
        stock,
        min_stock,
        price,
        (price * stock) as stock_value,
        CASE 
          WHEN min_stock > 0 THEN ROUND((stock::float / min_stock::float) * 100, 1)
          ELSE 100
        END as stock_percentage
      FROM products
      WHERE stock <= min_stock AND available = true
      ORDER BY stock_percentage ASC, stock ASC
      LIMIT 20
    `;

    // 6. RESUMEN POR VENDEDOR
    const sellerSummaryQuery = `
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        COUNT(s.id) as total_sales,
        SUM(s.total) as total_amount,
        AVG(s.total) as avg_sale,
        MAX(s.date) as last_sale
      FROM users u
      JOIN sales s ON u.id = s.user_id
      WHERE s.${whereClause}
      GROUP BY u.id, u.username, u.first_name, u.last_name
      ORDER BY total_amount DESC
    `;

    // Ejecutar todas las consultas
    const [
      salesResult,
      topProductsResult,
      dailySalesResult,
      topCustomersResult,
      lowStockResult,
      sellerSummaryResult
    ] = await Promise.all([
      client.query(salesFinancialQuery),
      client.query(topProductsQuery),
      client.query(dailySalesQuery),
      client.query(topCustomersQuery),
      client.query(lowStockQuery),
      client.query(sellerSummaryQuery)
    ]);

    // Procesar datos financieros
    const salesData = salesResult.rows[0];
    const totalRevenue = parseFloat(salesData.total_revenue);
    const totalCosts = parseFloat(salesData.total_costs);
    const totalProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

    // Formatear respuesta
    const reportData = {
      // Resumen financiero
      financial_summary: {
        total_sales: parseInt(salesData.total_sales),
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        total_profit: totalProfit,
        profit_margin: parseFloat(profitMargin.toFixed(2)),
        avg_sale: parseFloat(salesData.avg_sale),
        total_tax: parseFloat(salesData.total_tax)
      },

      // Ventas por día de la semana
      sales_by_weekday: {
        sunday: parseInt(salesData.sunday_sales),
        monday: parseInt(salesData.monday_sales),
        tuesday: parseInt(salesData.tuesday_sales),
        wednesday: parseInt(salesData.wednesday_sales),
        thursday: parseInt(salesData.thursday_sales),
        friday: parseInt(salesData.friday_sales),
        saturday: parseInt(salesData.saturday_sales)
      },

      // Ventas por método de pago
      sales_by_payment_method: {
        cash: {
          count: parseInt(salesData.cash_sales),
          amount: parseFloat(salesData.cash_amount)
        },
        card: {
          count: parseInt(salesData.card_sales),
          amount: parseFloat(salesData.card_amount)
        },
        transfer: {
          count: parseInt(salesData.transfer_sales),
          amount: parseFloat(salesData.transfer_amount)
        }
      },

      // Productos populares
      top_products: topProductsResult.rows.map(product => ({
        id: product.id,
        name: product.name,
        price: parseFloat(product.price),
        cost: parseFloat(product.cost || 0),
        total_sold: parseInt(product.total_sold),
        times_sold: parseInt(product.times_sold),
        total_revenue: parseFloat(product.total_revenue),
        total_cost: parseFloat(product.total_cost),
        total_profit: parseFloat(product.total_profit),
        avg_selling_price: parseFloat(product.avg_selling_price),
        current_stock: parseInt(product.current_stock)
      })),

      // Ventas diarias
      daily_sales: dailySalesResult.rows.map(day => ({
        date: day.sale_date,
        sales_count: parseInt(day.sales_count),
        total: parseFloat(day.daily_total),
        avg: parseFloat(day.daily_avg)
      })),

      // Clientes top
      top_customers: topCustomersResult.rows.map(customer => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        total_purchases: parseInt(customer.total_purchases),
        total_spent: parseFloat(customer.total_spent),
        avg_purchase: parseFloat(customer.avg_purchase),
        last_purchase: customer.last_purchase
      })),

      // Productos con stock bajo
      low_stock_products: lowStockResult.rows.map(product => ({
        id: product.id,
        name: product.name,
        stock: parseInt(product.stock),
        min_stock: parseInt(product.min_stock),
        price: parseFloat(product.price),
        stock_value: parseFloat(product.stock_value),
        stock_percentage: parseFloat(product.stock_percentage)
      })),

      // Resumen por vendedor
      seller_summary: sellerSummaryResult.rows.map(seller => ({
        id: seller.id,
        username: seller.username,
        name: `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.username,
        total_sales: parseInt(seller.total_sales),
        total_amount: parseFloat(seller.total_amount),
        avg_sale: parseFloat(seller.avg_sale),
        last_sale: seller.last_sale
      })),

      // Metadatos
      period: period,
      generated_at: new Date().toISOString(),
      report_type: report_type
    };

    res.status(200).json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('Error en reports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor',
      message: error.message 
    });
  } finally {
    client.release();
  }
}