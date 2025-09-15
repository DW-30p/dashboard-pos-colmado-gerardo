# 🏪 Dashboard POS - Colmado Gerardo

Dashboard moderno para sistema de punto de venta (POS) con base de datos PostgreSQL alojada en Neon y desplegado en Vercel.

## 🚀 Características

- **Dashboard Principal**: Métricas en tiempo real de ventas, inventario y clientes
- **Historial de Ventas**: Consulta completa de todas las transacciones
- **Reportes Avanzados**: Análisis financiero detallado y reportes por período
- **Responsive Design**: Optimizado para desktop y móvil
- **Base de Datos PostgreSQL**: Alojada en Neon con SSL
- **Despliegue en Vercel**: Serverless functions para la API

## 📊 Funcionalidades

### Dashboard
- Ingresos del período actual
- Ventas semanales y mensuales
- Balance de caja en tiempo real
- Total de clientes registrados
- Valor del inventario
- Productos con stock bajo

### Historial de Ventas
- Filtros por período (hoy, semana, mes, año)
- Información detallada de cada venta
- Búsqueda por cliente, vendedor o NCF
- Paginación de resultados

### Reportes
- Análisis financiero completo
- Productos más vendidos
- Clientes frecuentes
- Ventas por método de pago
- Resumen por vendedor

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js con Vercel Serverless Functions
- **Base de Datos**: PostgreSQL (Neon)
- **Deployment**: Vercel
- **Autenticación**: Preparado para bcrypt

## 📦 Instalación

### Prerrequisitos
- Cuenta en [Neon](https://neon.tech) con base de datos PostgreSQL
- Cuenta en [Vercel](https://vercel.com)
- Node.js 18+ (para desarrollo local)

### 1. Clonar el repositorio
```bash
git clone <tu-repositorio>
cd pos-dashboard
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env.local
```

Edita `.env.local` con tu string de conexión de Neon:
```
DATABASE_URL=postgresql://usuario:password@ep-xxx.us-east-1.postgres.vercel-storage.com/nombre_bd?sslmode=require
```

### 4. Probar conexión (desarrollo local)
```bash
npm run dev
```

Visita: `http://localhost:3000/api/test-connection`

## 🚀 Despliegue en Vercel

### 1. Instalar Vercel CLI
```bash
npm i -g vercel
```

### 2. Desplegar
```bash
vercel --prod
```

### 3. Configurar variable de entorno en Vercel
En el dashboard de Vercel:
1. Ve a tu proyecto
2. Settings → Environment Variables
3. Añade: `DATABASE_URL` con tu string de conexión de Neon

### 4. Verificar despliegue
Visita: `https://tu-proyecto.vercel.app/api/test-connection`

## 📁 Estructura del Proyecto

```
pos-dashboard/
├── index.html              # Dashboard principal
├── package.json            # Dependencias del proyecto
├── vercel.json            # Configuración de Vercel
├── README.md              # Documentación
├── .env.example           # Ejemplo de variables de entorno
└── api/
    ├── dashboard-stats.js # Estadísticas del dashboard
    ├── sales-history.js   # Historial de ventas
    ├── reports.js         # Reportes y análisis
    └── test-connection.js # Prueba de conexión a BD
```

## 🔌 Endpoints de la API

### GET `/api/test-connection`
Prueba la conexión a la base de datos
```json
{
  "success": true,
  "message": "Conexión a base de datos exitosa",
  "data": {
    "connection_info": {...},
    "tables": [...],
    "record_counts": {...}
  }
}
```

### GET `/api/dashboard-stats`
Obtiene estadísticas principales del dashboard
```json
{
  "success": true,
  "data": {
    "periodIncome": 0,
    "weeklySales": 0,
    "monthlySales": 0,
    "cashBalance": 0,
    "totalSales": 0,
    "avgSale": 0,
    "inventoryValue": 0,
    "totalCustomers": 0,
    "lowStockCount": 0
  }
}
```

### GET `/api/sales-history?period=month&limit=100`
Obtiene el historial de ventas
- **Parámetros**:
  - `period`: today, week, month, quarter, year, all
  - `limit`: número de registros (default: 100)
  - `offset`: para paginación (default: 0)

### GET `/api/reports?period=month&report_type=all`
Obtiene reportes completos
- **Parámetros**:
  - `period`: today, week, month, quarter, year
  - `report_type`: all, financial, products, customers

## 💾 Base de Datos

El dashboard está diseñado para trabajar con la estructura de base de datos PostgreSQL proporcionada, que incluye:

- `users` - Usuarios del sistema
- `products` - Catálogo de productos
- `customers` - Base de clientes
- `sales` - Registro de ventas
- `sale_items` - Detalles de productos vendidos
- `categories` - Categorías de productos
- `cash_register` - Control de caja
- `store_config` - Configuración de la tienda

## 🔒 Seguridad

- Conexiones SSL a la base de datos
- Validación de parámetros en todos los endpoints
- Manejo seguro de errores sin exponer información sensible
- Variables de entorno para credenciales

## 🐛 Solución de Problemas

### Error de conexión a la base de datos
1. Verifica que `DATABASE_URL` esté configurada correctamente
2. Asegúrate de que la base de datos en Neon esté activa
3. Comprueba que el string de conexión incluya `?sslmode=require`

### Datos vacíos en el dashboard
- Es normal si tienes una base de datos limpia (sin ventas)
- Prueba agregando algunos datos de prueba

### Error 500 en las APIs
1. Revisa los logs en Vercel Dashboard
2. Verifica que todas las tablas existan en tu base de datos
3. Comprueba que el usuario de la BD tenga los permisos necesarios

## 📈 Próximas Funcionalidades

- [ ] Autenticación de usuarios
- [ ] Modo oscuro
- [ ] Exportación de reportes (PDF, Excel)
- [ ] Notificaciones en tiempo real
- [ ] Dashboard para vendedores
- [ ] Integración con impresoras de tickets

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 📞 Soporte

Para soporte o preguntas:
- Abrir un issue en GitHub
- Email: soporte@colmadogerardo.com

---

⭐ **¡Dale una estrella al repo si te fue útil!**