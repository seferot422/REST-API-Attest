const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const helmet = require('helmet');

// Инициализация приложения
const app = express();

// Middleware
app.use(express.json());
app.use(helmet());
app.use(morgan('combined'));

// Конфигурация
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const API_VERSION = 'v1';

// Расширенная схема валидации с кастомными сообщениями
const userSchema = Joi.object({
    firstName: Joi.string().min(2).max(50).required()
        .messages({
            'string.empty': 'Имя не может быть пустым',
            'string.min': 'Имя должно содержать минимум {#limit} символа',
            'any.required': 'Имя является обязательным полем'
        }),
    lastName: Joi.string().min(2).max(50).required()
        .messages({
            'string.empty': 'Фамилия не может быть пустой',
            'string.min': 'Фамилия должна содержать минимум {#limit} символа'
        }),
    age: Joi.number().min(1).max(120).required()
        .messages({
            'number.base': 'Возраст должен быть числом',
            'number.min': 'Возраст должен быть не менее {#limit} лет',
            'number.max': 'Возраст должен быть не более {#limit} лет'
        }),
    email: Joi.string().email().required(),
    city: Joi.string().min(2).max(50),
    hobbies: Joi.array().items(Joi.string()).default([]),
    isActive: Joi.boolean().default(true)
}).options({ abortEarly: false });

// Вспомогательные функции для работы с файлом
async function readUsersFile() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(USERS_FILE, JSON.stringify([]));
            return [];
        }
        throw error;
    }
}

async function writeUsersFile(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// Генерация уникального ID (более надежный способ)
function generateUserId() {
    return uuidv4();
}

// Middleware для валидации
function validateUserData(req, res, next) {
    const { error, value } = userSchema.validate(req.body);
    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.context.key,
            message: detail.message
        }));
        return res.status(422).json({ 
            status: 'error',
            errors 
        });
    }
    req.validatedData = value;
    next();
}

// API Routes
app.get(`/${API_VERSION}/users`, async (req, res) => {
    try {
        const users = await readUsersFile();
        const { q, city, isActive } = req.query;
        
        // Фильтрация пользователей
        let filteredUsers = users;
        if (q) {
            const searchTerm = q.toLowerCase();
            filteredUsers = filteredUsers.filter(user => 
                user.firstName.toLowerCase().includes(searchTerm) || 
                user.lastName.toLowerCase().includes(searchTerm)
            );
        }
        if (city) {
            filteredUsers = filteredUsers.filter(user => 
                user.city && user.city.toLowerCase() === city.toLowerCase()
            );
        }
        if (isActive) {
            filteredUsers = filteredUsers.filter(user => 
                user.isActive === (isActive === 'true')
            );
        }

        res.json({
            status: 'success',
            data: filteredUsers,
            meta: {
                total: filteredUsers.length,
                returned: filteredUsers.length
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось получить список пользователей'
        });
    }
});

app.get(`/${API_VERSION}/users/:id`, async (req, res) => {
    try {
        const users = await readUsersFile();
        const user = users.find(u => u.id === req.params.id);
        
        if (!user) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Пользователь не найден' 
            });
        }
        
        res.json({
            status: 'success',
            data: user
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось получить данные пользователя'
        });
    }
});

app.post(`/${API_VERSION}/users`, validateUserData, async (req, res) => {
    try {
        const users = await readUsersFile();
        const newUser = {
            id: generateUserId(),
            ...req.validatedData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        users.push(newUser);
        await writeUsersFile(users);
        
        res.status(201).json({
            status: 'success',
            data: newUser
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось создать пользователя'
        });
    }
});

app.put(`/${API_VERSION}/users/:id`, validateUserData, async (req, res) => {
    try {
        const users = await readUsersFile();
        const userIndex = users.findIndex(u => u.id === req.params.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Пользователь не найден' 
            });
        }
        
        const updatedUser = {
            ...users[userIndex],
            ...req.validatedData,
            updatedAt: new Date().toISOString()
        };
        
        users[userIndex] = updatedUser;
        await writeUsersFile(users);
        
        res.json({
            status: 'success',
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось обновить данные пользователя'
        });
    }
});

app.patch(`/${API_VERSION}/users/:id`, async (req, res) => {
    try {
        const users = await readUsersFile();
        const userIndex = users.findIndex(u => u.id === req.params.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Пользователь не найден' 
            });
        }
        
        const { error } = userSchema.validate(req.body, { abortEarly: false });
        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.context.key,
                message: detail.message
            }));
            return res.status(422).json({ 
                status: 'error',
                errors 
            });
        }
        
        const updatedUser = {
            ...users[userIndex],
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        
        users[userIndex] = updatedUser;
        await writeUsersFile(users);
        
        res.json({
            status: 'success',
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось частично обновить данные пользователя'
        });
    }
});

app.delete(`/${API_VERSION}/users/:id`, async (req, res) => {
    try {
        const users = await readUsersFile();
        const userIndex = users.findIndex(u => u.id === req.params.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Пользователь не найден' 
            });
        }
        
        const [deletedUser] = users.splice(userIndex, 1);
        await writeUsersFile(users);
        
        res.json({
            status: 'success',
            data: deletedUser,
            message: 'Пользователь успешно удален'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось удалить пользователя'
        });
    }
});

// Обработка несуществующих роутов
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Запрашиваемый ресурс не найден'
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Внутренняя ошибка сервера'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`API доступно по адресу: http://localhost:${PORT}/${API_VERSION}/users`);
});
