<p align="center">
  <a href="https://web.munisjl.gob.pe/web/" target="blank">
    <img src="./client/logo.png" width="320" alt="MDSJL" />
  </a>
  <br>
  <img src="https://img.shields.io/badge/Sistema-SGC-2D6A80?style=for-the-badge&logo=government&logoColor=white">
</p>

<h3 align="center">Sistema de Gestión de Cámaras</h3>
<p align="center">
  <em>Sistema de Gestión de Cámaras de la Central de Control y Monitoreo de la Municipalidad de San Juan de Lurigancho</em>
</p>

<p align="center">
  <a href="https://www.munisanjuan.gob.pe" target="_blank">
    <img src="https://img.shields.io/badge/Institución-MDSJL-0077B6?style=flat-square&logo=government&logoColor=white">
  </a>
  <a href="LICENSE" target="_blank">
    <img src="https://img.shields.io/badge/Licencia-Municipal-blueviolet?style=flat-square">
  </a>
</p>

## 📘 Descripción

Este repositorio contiene el backend del Sistema de Gestión de Cámaras (SGC), desarrollado por el equipo de desarrolladores de la Central de Control y  Monitoreo de la Municipalidad de San Juan de Lurigancho.

El sistema está construido utilizando el framework  [NestJS](https://github.com/nestjs/nest), bajo una arquitectura modular que facilita el mantenimiento y escalabilidad del proyecto.

Permite gestionar las cámaras, así como la obtención de la ubicación de las incidencias más urgentes.

---

## 🔑 Características principales

- Registro y gestión de cámaras
- Asignación de roles
- Visualización de incidencias
- Filtros destacados

---

## ⚙️ Configuración del Proyecto

### 1️⃣ Instalar dependencias

```bash
yarn install
```

Instala todos los paquetes definidos en `package.json`, incluyendo NestJS, Prisma, y otras dependencias esenciales.

---

### 2️⃣ Configurar variables de entorno

Renombra el archivo `.env.template` a `.env` y completa las variables necesarias:

```bash
cp .env.template .env
```

> ⚠️ Asegúrate de que la variable `DATABASE_URL` esté bien definida según tu entorno.

---

### 3️⃣ Configurar Prisma

```bash
npx prisma generate
npx prisma db push
```

- `prisma generate`: Genera el cliente Prisma basado en `schema.prisma`.
- `prisma db push`: Sincroniza tu esquema con la base de datos (sin usar migraciones).

---

### 4️⃣ Ejecutar el servidor

```bash
# Modo desarrollo
yarn start:dev

# Modo normal
yarn start

# Modo producción
yarn start:prod
```

---

## 🚀 Deployment

Para desplegar este proyecto, ten en cuenta lo siguiente:

### 📦 Requisitos mínimos en producción

- Node.js 18+
- PostgreSQL 12+
- PM2, Docker o servicio equivalente para manejar procesos
- Variables de entorno correctamente configuradas (`.env`)
- Prisma Client generado (`npx prisma generate`)
- Esquema sincronizado con la BD (`npx prisma db push` o `migrate deploy` si usas migraciones)

---

### 🔧 Pasos básicos para producción

```bash
# Instalar dependencias sin devDependencies
yarn install

# Generar Prisma Client
npx prisma generate

# Sincronizar con la base de datos
npx prisma db push

# Ejecutar en modo producción
yarn build
```

> También puedes usar `PM2`, `Docker` o `Nginx` como proxy inverso para manejar procesos y despliegue continuo.

---

## 🛠 Soporte Técnico

El equipo de desarrollo encargado del backend del Sistema de Gestión de Cámaras está conformado por:

- **Eduardo Villegas** – Backend Developer
- **Andre Yauri** – Backend Developer
---


## 📄 Licencia

El sistema backend utiliza el framework **NestJS** bajo la Licencia MIT.

---

<p align="center">
  <sub>Desarrollado por el equipo de desarrollo de la Central de Comunicaciones de la Municipalidad de San Juan de Lurigancho</sub>
  <br>
  <img src="./client/logo.png" width="320" alt="MDSJL" />
</p>
