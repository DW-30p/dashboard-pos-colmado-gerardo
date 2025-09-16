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

    // 1. VENTAS Y GANANCIAS (Consulta simplificada)
    const salesFinancialQuery = `
      SELECT 
        -- Ventas generales
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(subtotal), 0) as subtotal_amount,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(AVG(total), 0) as avg_sale,
        
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

    // 2. COSTOS SEPARADOS (Consulta simplificada)
    const costsQuery = `
      SELECT 
        COALESCE(SUM(si.quantity * COALESCE(p.cost, 0)), 0) as total_costs
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.${whereClause}
    `;

    // 3. PRODUCTOS POPULARES (Sin ROUND problemático)
    const topProductsQuery = `
      SELECT 
        p.id,
        p.name,
        p.price,
        COALESCE(p.cost, 0) as cost,
        COALESCE(SUM(si.quantity), 0) as total_sold,
        COUNT(DISTINCT si.sale_id) as times_sold,
        COALESCE(SUM(si.subtotal), 0) as total_revenue,
        COALESCE(SUM(si.quantity * COALESCE(p.cost, 0)), 0) as total_cost,
        COALESCE(SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost, 0)), 0) as total_profit,
        COALESCE(AVG(si.unit_price), 0) as avg_selling_price,
        COALESCE(p.stock, 0) as current_stock
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.${whereClause}
      GROUP BY p.id, p.name, p.price, p.cost, p.stock
      ORDER BY total_sold DESC
      LIMIT 20
    `;

    // 4. VENTAS DIARIAS (Simplificado)
    const dailySalesQuery = `
      SELECT 
        DATE(date) as sale_date,
        COUNT(*) as sales_count,
        COALESCE(SUM(total), 0) as daily_total,
        COALESCE(AVG(total), 0) as daily_avg
      FROM sales
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(date)
      ORDER BY sale_date DESC
      LIMIT 30
    `;

    // 5. CLIENTES TOP (Simplificado)
    const topCustomersQuery = `
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.email,
        COUNT(s.id) as total_purchases,
        COALESCE(SUM(s.total), 0) as total_spent,
        COALESCE(AVG(s.total), 0) as avg_purchase,
        MAX(s.date) as last_purchase
      FROM customers c
      JOIN sales s ON c.id = s.customer_id
      WHERE s.${whereClause}
      GROUP BY c.id, c.name, c.phone, c.email
      ORDER BY total_spent DESC
      LIMIT 10
    `;

    // 6. PRODUCTOS CON STOCK BAJO (Sin ROUND)
    const lowStockQuery = `
      SELECT 
        id,
        name,
        COALESCE(stock, 0) as stock,
        COALESCE(min_stock, 0) as min_stock,
        COALESCE(price, 0) as price,
        COALESCE(price * stock, 0) as stock_value,
        CASE 
          WHEN COALESCE(min_stock, 0) > 0 THEN (COALESCE(stock, 0)::float / min_stock::float) * 100
          ELSE 100
        END as stock_percentage
      FROM products
      WHERE COALESCE(stock, 0) <= COALESCE(min_stock, 0) AND available = true
      ORDER BY stock_percentage ASC, stock ASC
      LIMIT 20
    `;

    // 7. RESUMEN POR VENDEDOR
    const sellerSummaryQuery = `
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        COUNT(s.id) as total_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(AVG(s.total), 0) as avg_sale,
        MAX(s.date) as last_sale
      FROM users u
      JOIN sales s ON u.id = s.user_id
      WHERE s.${whereClause}
      GROUP BY u.id, u.username, u.first_name, u.last_name
      ORDER BY total_amount DESC
    `;

    // Ejecutar consultas básicas primero
    let salesResult, costsResult;
    
    try {
      salesResult = await client.query(salesFinancialQuery);
    } catch (error) {
      console.error('Sales query error:', error);
      salesResult = { rows: [{ 
        total_sales: 0, total_revenue: 0, subtotal_amount: 0, total_tax: 0, avg_sale: 0,
        sunday_sales: 0, monday_sales: 0, tuesday_sales: 0, wednesday_sales: 0,
        thursday_sales: 0, friday_sales: 0, saturday_sales: 0,
        cash_sales: 0, card_sales: 0, transfer_sales: 0,
        cash_amount: 0, card_amount: 0, transfer_amount: 0
      }] };
    }

    try {
      costsResult = await client.query(costsQuery);
    } catch (error) {
      console.error('Costs query error:', error);
      costsResult = { rows: [{ total_costs: 0 }] };
    }

    // Consultas opcionales con manejo de errores individual
    let topProductsResult = { rows: [] };
    let dailySalesResult = { rows: [] };
    let topCustomersResult = { rows: [] };
    let lowStockResult = { rows: [] };
    let sellerSummaryResult = { rows: [] };

    try {
      topProductsResult = await client.query(topProductsQuery);
    } catch (error) {
      console.error('Top products query error:', error);
    }

    try {
      dailySalesResult = await client.query(dailySalesQuery);
    } catch (error) {
      console.error('Daily sales query error:', error);
    }

    try {
      topCustomersResult = await client.query(topCustomersQuery);
    } catch (error) {
      console.error('Top customers query error:', error);
    }

    try {
      lowStockResult = await client.query(lowStockQuery);
    } catch (error) {
      console.error('Low stock query error:', error);
    }

    try {
      sellerSummaryResult = await client.query(sellerSummaryQuery);
    } catch (error) {
      console.error('Seller summary query error:', error);
    }

    // Procesar datos financieros
    const salesData = salesResult.rows[0];
    const costsData = costsResult.rows[0];
    const totalRevenue = parseFloat(salesData.total_revenue);
    const totalCosts = parseFloat(costsData.total_costs || 0);
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