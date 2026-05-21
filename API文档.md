# 维修工单系统 API 文档

## 概述

本文档详细描述了维修工单系统的所有API接口，包括认证、用户管理、工单管理、物料申请、通知、聊天和系统设置等模块。

## 基础信息

- API基础路径：`/api`
- 请求方式：GET、POST、PUT、DELETE
- 认证方式：JWT Token（在请求头中添加 `Authorization: Bearer <token>`）
- 响应格式：JSON

## 错误响应格式

```json
{
  "error": "错误描述",
  "message": "详细错误信息"
}
```

## 认证模块 (`/api/auth`)

### 1. 用户注册

**请求**
- 路径：`/api/auth/register`
- 方法：POST
- 参数：
  ```json
  {
    "username": "用户名",
    "password": "密码",
    "confirmPassword": "确认密码",
    "fullName": "姓名",
    "phone": "手机号（可选）",
    "email": "邮箱（可选）"
  }
  ```

**响应**
- 成功：
  ```json
  {
    "message": "注册成功",
    "userId": 1
  }
  ```
- 失败：
  ```json
  {
    "errors": [
      { "msg": "用户名不能为空", "param": "username", "location": "body" }
    ]
  }
  ```

### 2. 用户登录

**请求**
- 路径：`/api/auth/login`
- 方法：POST
- 参数：
  ```json
  {
    "username": "用户名",
    "password": "密码"
  }
  ```

**响应**
- 成功：
  ```json
  {
    "token": "JWT令牌",
    "user": {
      "id": 1,
      "username": "用户名",
      "fullName": "姓名",
      "phone": "手机号",
      "email": "邮箱",
      "accountType": "用户类型",
      "permissions": "权限"
    }
  }
  ```
- 失败：
  ```json
  {
    "error": "用户名或密码错误"
  }
  ```

### 3. 获取当前用户信息

**请求**
- 路径：`/api/auth/me`
- 方法：GET
- 认证：需要JWT Token

**响应**
- 成功：
  ```json
  {
    "id": 1,
    "username": "用户名",
    "fullName": "姓名",
    "phone": "手机号",
    "email": "邮箱",
    "address": "地址",
    "transportType": "交通工具",
    "accountType": "用户类型",
    "permissions": "权限"
  }
  ```

## 用户模块 (`/api/users`)

### 1. 获取工程师列表

**请求**
- 路径：`/api/users/engineers`
- 方法：GET
- 参数：
  - `search`：搜索关键词（可选）

**响应**
```json
[
  {
    "id": 2,
    "username": "engineer1",
    "fullName": "工程师1",
    "phone": "13800138000"
  }
]
```

### 2. 获取所有用户（管理员）

**请求**
- 路径：`/api/users`
- 方法：GET
- 认证：需要JWT Token
- 权限：用户管理
- 参数：
  - `search`：搜索关键词（可选）
  - `accountType`：账号类型（可选）
  - `permissions`：权限（可选）

**响应**
```json
[
  {
    "id": 1,
    "username": "admin",
    "fullName": "管理员",
    "phone": "13800138000",
    "email": "admin@example.com",
    "accountType": "admin",
    "permissions": "用户管理|工单管理|仓储管理",
    "address": "地址",
    "transportType": "汽车",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### 3. 添加用户（管理员）

**请求**
- 路径：`/api/users`
- 方法：POST
- 认证：需要JWT Token
- 权限：用户管理
- 参数：
  ```json
  {
    "username": "用户名",
    "password": "密码",
    "fullName": "姓名",
    "phone": "手机号",
    "email": "邮箱",
    "accountType": "用户类型",
    "permissions": "权限",
    "address": "地址",
    "transportType": "交通工具"
  }
  ```

**响应**
- 成功：
  ```json
  {
    "message": "用户创建成功",
    "userId": 3
  }
  ```

### 4. 更新用户（管理员）

**请求**
- 路径：`/api/users/:id`
- 方法：PUT
- 认证：需要JWT Token
- 权限：用户管理
- 参数：同添加用户（可选字段）

**响应**
```json
{
  "message": "用户更新成功"
}
```

### 5. 删除用户（管理员）

**请求**
- 路径：`/api/users/:id`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：用户管理

**响应**
```json
{
  "message": "用户删除成功"
}
```

### 6. 获取单个用户信息

**请求**
- 路径：`/api/users/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "id": 1,
  "username": "admin",
  "fullName": "管理员",
  "phone": "13800138000",
  "email": "admin@example.com",
  "accountType": "admin",
  "permissions": "用户管理|工单管理",
  "address": "地址",
  "transportType": "汽车"
}
```

### 7. 更新个人信息

**请求**
- 路径：`/api/users/profile/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "fullName": "姓名",
    "phone": "手机号",
    "email": "邮箱",
    "address": "地址",
    "transportType": "交通工具"
  }
  ```

**响应**
```json
{
  "id": 1,
  "username": "admin",
  "fullName": "新姓名",
  "phone": "新手机号",
  "email": "新邮箱",
  "accountType": "admin",
  "permissions": "用户管理|工单管理",
  "address": "新地址",
  "transportType": "新交通工具"
}
```

### 8. 修改密码

**请求**
- 路径：`/api/users/password/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "currentPassword": "当前密码",
    "newPassword": "新密码",
    "confirmPassword": "确认新密码"
  }
  ```

**响应**
```json
{
  "message": "密码修改成功"
}
```

### 9. 上传头像

**请求**
- 路径：`/api/users/avatar`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  - `avatar`：文件（multipart/form-data）

**响应**
```json
{
  "message": "头像上传成功",
  "avatarPath": "/uploads/avatars/avatar-1-1678900000000-123456789.png"
}
```

### 10. 删除头像

**请求**
- 路径：`/api/users/avatar`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "message": "头像删除成功"
}
```

### 11. 获取用户头像

**请求**
- 路径：`/api/users/:id/avatar`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "avatarPath": "/uploads/avatars/avatar-1-1678900000000-123456789.png"
}
```

### 12. 获取用户通知设置

**请求**
- 路径：`/api/users/notification-settings/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "notification_types": "permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change",
  "sound_enabled": true
}
```

### 13. 更新用户通知设置

**请求**
- 路径：`/api/users/notification-settings/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "notification_types": "permission_change|account_type_change|new_order",
    "sound_enabled": true
  }
  ```

**响应**
```json
{
  "message": "通知设置更新成功"
}
```

## 工单模块 (`/api/work-orders`)

### 1. 获取工单列表

**请求**
- 路径：`/api/work-orders`
- 方法：GET
- 认证：需要JWT Token
- 权限：查看
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认10）
  - `sortBy`：排序字段（默认create_time）
  - `sortOrder`：排序方向（默认DESC）
  - `status`：状态筛选
  - `search`：搜索关键词
  - `customerPhone`：客户电话

**响应**
```json
{
  "workOrders": [
    {
      "id": 1,
      "create_time": "2024-01-01T00:00:00Z",
      "service_time": "2024-01-02T00:00:00Z",
      "work_type": "repair",
      "work_description": "设备故障",
      "customer_name": "客户A",
      "customer_phone": "13800138000",
      "customer_address": "地址A",
      "engineer_id": 2,
      "engineer_name": "工程师1",
      "currentStatus": "服务中",
      "statusHistory": [
        "等待服务T2024-01-01T00:00:00Z",
        "派单成功-工程师:工程师1T2024-01-01T10:00:00Z",
        "服务中T2024-01-01T14:00:00Z"
      ]
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 2. 获取我的工单

**请求**
- 路径：`/api/work-orders/my`
- 方法：GET
- 认证：需要JWT Token
- 参数：同获取工单列表

**响应**：同获取工单列表

### 3. 获取工单详情

**请求**
- 路径：`/api/work-orders/:id`
- 方法：GET
- 认证：需要JWT Token
- 权限：查看

**响应**
```json
{
  "id": 1,
  "create_time": "2024-01-01T00:00:00Z",
  "service_time": "2024-01-02T00:00:00Z",
  "work_type": "repair",
  "work_description": "设备故障",
  "customer_name": "客户A",
  "customer_phone": "13800138000",
  "customer_address": "地址A",
  "engineer_id": 2,
  "engineer_name": "工程师1",
  "currentStatus": "服务中",
  "statusHistory": [
    "等待服务T2024-01-01T00:00:00Z",
    "派单成功-工程师:工程师1T2024-01-01T10:00:00Z",
    "服务中T2024-01-01T14:00:00Z"
  ],
  "images": [
    "/uploads/work-order-images/work-order-1678900000000-123456789.png"
  ],
  "materials": [
    {
      "id": 1,
      "name": "零件A",
      "images": [],
      "quantity": 1,
      "status": "已批准"
    }
  ]
}
```

### 4. 创建工单

**请求**
- 路径：`/api/work-orders`
- 方法：POST
- 认证：需要JWT Token
- 权限：新建
- 参数：
  - `serviceTime`：服务时间
  - `workType`：工单类型（repair/delivery/other）
  - `workDescription`：工作描述
  - `customerName`：客户姓名
  - `customerPhone`：客户电话
  - `customerAddress`：客户地址
  - `notes`：备注
  - `images`：图片文件（multipart/form-data，最多5张）

**响应**
```json
{
  "message": "工单创建成功",
  "workOrderId": 1,
  "uploadedImages": [
    "/uploads/work-order-images/work-order-1678900000000-123456789.png"
  ]
}
```

### 5. 更新工单

**请求**
- 路径：`/api/work-orders/:id`
- 方法：PUT
- 认证：需要JWT Token
- 权限：修改
- 参数：同创建工单（可选字段）

**响应**
```json
{
  "message": "工单更新成功",
  "images": [
    "/uploads/work-order-images/work-order-1678900000000-123456789.png"
  ]
}
```

### 6. 承接工单

**请求**
- 路径：`/api/work-orders/:id/assign`
- 方法：POST
- 认证：需要JWT Token
- 权限：承接

**响应**
```json
{
  "message": "工单承接成功"
}
```

### 7. 管理员分配工程师

**请求**
- 路径：`/api/work-orders/:id/admin-assign`
- 方法：POST
- 认证：需要JWT Token
- 权限：修改
- 参数：
  ```json
  {
    "engineer_id": 2
  }
  ```

**响应**
```json
{
  "message": "工程师分配成功"
}
```

### 8. 更新服务状态

**请求**
- 路径：`/api/work-orders/:id/status`
- 方法：PUT
- 认证：需要JWT Token
- 权限：修改
- 参数：
  ```json
  {
    "status": "服务中"
  }
  ```

**响应**
```json
{
  "message": "服务状态更新成功"
}
```

### 9. 批量更新工单状态

**请求**
- 路径：`/api/work-orders/batch/status`
- 方法：PUT
- 认证：需要JWT Token
- 权限：修改
- 参数：
  ```json
  {
    "ids": [1, 2, 3],
    "status": "完成"
  }
  ```

**响应**
```json
{
  "message": "批量更新完成",
  "results": [
    { "id": 1, "success": true },
    { "id": 2, "success": true },
    { "id": 3, "success": false, "error": "工单不存在" }
  ]
}
```

### 10. 退回工单

**请求**
- 路径：`/api/work-orders/:id/reject`
- 方法：PUT
- 认证：需要JWT Token
- 权限：修改
- 参数：
  ```json
  {
    "rejectReason": "退回原因"
  }
  ```

**响应**
```json
{
  "message": "工单退回成功"
}
```

### 11. 删除工单

**请求**
- 路径：`/api/work-orders/:id`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：删除

**响应**
```json
{
  "message": "工单删除成功"
}
```

### 12. 获取最近工单

**请求**
- 路径：`/api/work-orders/recent/list`
- 方法：GET
- 认证：需要JWT Token
- 权限：查看

**响应**
```json
[
  {
    "id": 1,
    "create_time": "2024-01-01T00:00:00Z",
    "service_time": "2024-01-02T00:00:00Z",
    "work_type": "repair",
    "work_description": "设备故障",
    "customer_name": "客户A",
    "currentStatus": "服务中"
  }
]
```

### 13. 获取台历数据

**请求**
- 路径：`/api/work-orders/calendar-data`
- 方法：GET
- 认证：需要JWT Token
- 权限：查看
- 参数：
  - `year`：年份
  - `month`：月份

**响应**
```json
{
  "success": true,
  "data": {
    "2024-01-01": [
      {
        "id": 1,
        "work_type": "repair",
        "work_description": "设备故障",
        "customer_name": "客户A",
        "customer_phone": "13800138000",
        "customer_address": "地址A",
        "service_time": "2024-01-01T10:00:00Z",
        "create_time": "2024-01-01T00:00:00Z",
        "engineer_name": "工程师1",
        "status": "等待服务",
        "creator_name": "管理员"
      }
    ]
  },
  "year": 2024,
  "month": 1
}
```

## 物料申请模块 (`/api/material-requests`)

### 1. 获取物料采购申请列表

**请求**
- 路径：`/api/material-requests/list`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `status`：状态筛选
  - `page`：页码（默认1）
  - `limit`：每页条数（默认10）

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "material_name": "零件A",
      "images": [
        "/uploads/materials/material-1678900000000-123456789.png"
      ],
      "quantity": 1,
      "status": "已批准",
      "applicant_name": "工程师1",
      "work_order_id": 1
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### 2. 获取单个物料采购申请详情

**请求**
- 路径：`/api/material-requests/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "material_name": "零件A",
    "images": [
      "/uploads/materials/material-1678900000000-123456789.png"
    ],
    "quantity": 1,
    "applicant_name": "工程师1",
    "work_order_customer": "客户A"
  }
}
```

### 3. 创建物料采购申请

**请求**
- 路径：`/api/material-requests/create`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  - `material_name`：物料名称
  - `quantity`：数量
  - `work_order_id`：工单ID（可选）
  - `images`：图片文件（multipart/form-data，最多6张）

**响应**
```json
{
  "success": true,
  "message": "物料采购申请提交成功",
  "data": {
    "id": 1
  }
}
```

### 4. 更新物料采购申请状态

**请求**
- 路径：`/api/material-requests/:id/status`
- 方法：PUT
- 认证：需要JWT Token
- 权限：仓储管理
- 参数：
  ```json
  {
    "status": "approved" // approved/purchasing/completed/warehouse_out/rejected
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "状态更新成功"
}
```

### 5. 关联工单

**请求**
- 路径：`/api/material-requests/:id/associate-work-order`
- 方法：PUT
- 认证：需要JWT Token
- 权限：修改
- 参数：
  ```json
  {
    "work_order_id": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "工单关联成功"
}
```

### 6. 删除物料采购申请

**请求**
- 路径：`/api/material-requests/:id`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：删除

**响应**
```json
{
  "success": true,
  "message": "删除成功"
}
```

## 通知模块 (`/api/notifications`)

### 1. 创建通知（测试）

**请求**
- 路径：`/api/notifications`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员或用户管理
- 参数：
  ```json
  {
    "recipient_type": "all", // all 或 specific
    "recipient_ids": [1, 2], // 接收者ID数组
    "title": "通知标题",
    "content": "通知内容",
    "type": "notification_type",
    "related_id": 1 // 相关ID（如工单ID）
  }
  ```

**响应**
```json
{
  "id": "1678900000000",
  "message": "通知已发送给所有用户",
  "success_count": 5,
  "total_users": 5
}
```

### 2. 获取通知列表

**请求**
- 路径：`/api/notifications`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认10）
  - `unreadOnly`：只看未读（true/false）
  - `readOnly`：只看已读（true/false）

**响应**
```json
{
  "notifications": [
    {
      "id": 1,
      "user_id": 1,
      "title": "工单操作通知",
      "content": "您的工单被修改",
      "type": "status_change",
      "related_id": 1,
      "is_read": false,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 10,
  "totalPages": 1,
  "unreadCount": 3,
  "page": 1,
  "limit": 10
}
```

### 3. 标记所有通知为已读

**请求**
- 路径：`/api/notifications/all/read`
- 方法：PUT
- 认证：需要JWT Token

**响应**
```json
{
  "message": "所有通知已标记为已读"
}
```

### 4. 标记通知为已读

**请求**
- 路径：`/api/notifications/:id/read`
- 方法：PUT
- 认证：需要JWT Token

**响应**
```json
{
  "message": "通知已标记为已读"
}
```

### 5. 删除通知

**请求**
- 路径：`/api/notifications/:id`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "通知删除成功"
}
```

### 6. 批量删除通知

**请求**
- 路径：`/api/notifications/batch/delete`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "ids": [1, 2, 3]
  }
  ```

**响应**
```json
{
  "message": "成功删除 3 条通知"
}
```

### 7. 删除所有已读通知

**请求**
- 路径：`/api/notifications/all/read`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "所有已读通知已删除"
}
```

### 8. 获取未读通知数量

**请求**
- 路径：`/api/notifications/unread/count`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "unreadCount": 3
}
```

### 9. 获取最新通知

**请求**
- 路径：`/api/notifications/latest`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "notification": {
    "id": 1,
    "title": "工单操作通知",
    "content": "您的工单被修改",
    "type": "status_change",
    "related_id": 1,
    "is_read": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### 10. 获取最新通知（轮询）

**请求**
- 路径：`/api/notifications/new`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `lastId`：上次获取的最大通知ID
  - `sinceTime`：时间戳

**响应**
```json
{
  "notifications": [
    {
      "id": 2,
      "title": "新消息",
      "content": "您有一条新消息",
      "type": "new_message",
      "related_id": 3,
      "is_read": false,
      "created_at": "2024-01-01T01:00:00Z"
    }
  ],
  "count": 1
}
```

## 聊天模块 (`/api/chat`)

### 1. 获取用户列表

**请求**
- 路径：`/api/chat/users`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
[
  {
    "id": 2,
    "username": "user1",
    "full_name": "用户1",
    "phone": "13800138000",
    "email": "user1@example.com",
    "account_type": "user",
    "avatar": "/uploads/avatars/avatar-2-1678900000000-123456789.png",
    "unreadCount": 2
  }
]
```

### 2. 获取与特定用户的聊天记录

**请求**
- 路径：`/api/chat/messages/:userId`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认20）

**响应**
```json
{
  "messages": [
    {
      "id": 1,
      "sender_id": 1,
      "receiver_id": 2,
      "content": "你好",
      "message_type": "text",
      "is_read": true,
      "created_at": "2024-01-01T00:00:00Z",
      "sender_name": "管理员"
    }
  ],
  "hasMore": false,
  "page": 1
}
```

### 3. 发送文本消息

**请求**
- 路径：`/api/chat/messages/:userId`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "content": "消息内容"
  }
  ```

**响应**
```json
{
  "message": "消息发送成功",
  "messageId": 1
}
```

### 4. 发送文件消息

**请求**
- 路径：`/api/chat/messages/:userId/file`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  - `file`：文件（multipart/form-data，最大10MB）

**响应**
```json
{
  "message": "文件发送成功",
  "messageId": 2,
  "fileUrl": "/uploads/chat/chat-1-1678900000000-123456789.pdf"
}
```

### 5. 获取会话列表

**请求**
- 路径：`/api/chat/conversations`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
[
  {
    "other_user_id": 2,
    "full_name": "用户1",
    "username": "user1",
    "account_type": "user",
    "avatar": "/uploads/avatars/avatar-2-1678900000000-123456789.png",
    "last_message_time": "2024-01-01T00:00:00Z",
    "unread_count": 2,
    "last_message": "你好"
  }
]
```

### 6. 标记消息为已读

**请求**
- 路径：`/api/chat/messages/:messageId/read`
- 方法：PUT
- 认证：需要JWT Token

**响应**
```json
{
  "message": "消息已标记为已读"
}
```

### 7. 获取未读消息总数

**请求**
- 路径：`/api/chat/unread-count`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "unreadCount": 5
}
```

### 8. 删除消息

**请求**
- 路径：`/api/chat/messages/:messageId`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "消息删除成功"
}
```

### 9. 批量删除与特定用户的聊天记录

**请求**
- 路径：`/api/chat/messages/user/:userId`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "聊天记录删除成功",
  "deletedCount": 10
}
```

## 系统设置模块 (`/api/settings`)

### 1. 获取日志清理周期设置

**请求**
- 路径：`/api/settings/log-clear-period`
- 方法：GET
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "period": 30
}
```

### 2. 更新日志清理周期设置

**请求**
- 路径：`/api/settings/log-clear-period`
- 方法：PUT
- 认证：需要JWT Token
- 权限：管理员
- 参数：
  ```json
  {
    "period": 30
  }
  ```

**响应**
```json
{
  "message": "设置保存成功",
  "period": 30
}
```

### 3. 获取所有设置

**请求**
- 路径：`/api/settings/all`
- 方法：GET
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "settings": {
    "log_clear_period": {
      "value": "30",
      "description": "日志自动清空周期（天），0表示不自动清空"
    }
  }
}
```

### 4. 手动清理日志

**请求**
- 路径：`/api/settings/clean-logs`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "message": "日志清理完成",
  "deletedCount": 100
}
```

### 5. 清空所有日志

**请求**
- 路径：`/api/settings/clear-all-logs`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "message": "所有日志已清空",
  "deletedCount": 500
}
```

## 其他API

### 1. 测试设备检测

**请求**
- 路径：`/test-device`
- 方法：GET

**响应**
```json
{
  "userAgent": "Mozilla/5.0 ...",
  "isMobile": false,
  "deviceType": "桌面端"
}
```

### 2. SSE实时通知

**请求**
- 路径：`/api/notifications/stream`
- 方法：GET
- 参数：
  - `userId`：用户ID

**响应**
- 类型：`text/event-stream`
- 格式：
  ```
  data: {"type": "connected", "connectionId": "1_1678900000000"}

  data: {"type": "heartbeat", "timestamp": 1678900000000}

  data: {"type": "notification", "data": {"title": "新消息", "content": "您有一条新消息"}}
  ```

## 权限说明

| 权限名称 | 描述 |
|---------|------|
| 查看 | 查看工单和用户信息 |
| 新建 | 创建新工单 |
| 修改 | 修改工单和用户信息 |
| 删除 | 删除工单和用户 |
| 承接 | 承接工单 |
| 用户管理 | 管理用户账号 |
| 工单管理 | 管理工单 |
| 仓储管理 | 管理物料和仓储 |

## 账号类型

| 账号类型 | 描述 |
|---------|------|
| admin | 管理员 |
| engineer | 工程师 |
| user | 普通用户 |
| customer_service | 客服 |

## 状态说明

### 工单状态

- 等待服务
- 派单成功
- 服务中
- 完成

### 物料申请状态

- 申请中
- 已同意
- 采购中
- 采购完成
- 已出库
- 已拒绝

## 收藏管理模块 (`/api/favorites`)

### 1. 获取收藏列表

**请求**
- 路径：`/api/favorites`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `folder_id`：文件夹ID（可选）

**响应**
```json
[
  {
    "id": 1,
    "name": "网站名称",
    "url": "https://example.com",
    "description": "网站描述",
    "folder_id": 1,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

### 2. 添加收藏

**请求**
- 路径：`/api/favorites`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "name": "网站名称",
    "url": "https://example.com",
    "description": "网站描述",
    "folder_id": 1
  }
  ```

**响应**
```json
{
  "id": 1,
  "name": "网站名称",
  "url": "https://example.com",
  "description": "网站描述",
  "folder_id": 1,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 3. 删除收藏

**请求**
- 路径：`/api/favorites/:id`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "收藏删除成功"
}
```

### 4. 更新收藏

**请求**
- 路径：`/api/favorites/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：同添加收藏（可选字段）

**响应**
```json
{
  "id": 1,
  "name": "新网站名称",
  "url": "https://example.com",
  "description": "新网站描述",
  "folder_id": 1,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z"
}
```

### 5. 获取文件夹列表

**请求**
- 路径：`/api/favorites/folders`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
[
  {
    "id": 1,
    "name": "文件夹名称",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

### 6. 创建文件夹

**请求**
- 路径：`/api/favorites/folders`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "name": "文件夹名称"
  }
  ```

**响应**
```json
{
  "id": 1,
  "name": "文件夹名称",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 7. 更新文件夹

**请求**
- 路径：`/api/favorites/folders/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "name": "新文件夹名称"
  }
  ```

**响应**
```json
{
  "id": 1,
  "name": "新文件夹名称",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z"
}
```

### 8. 删除文件夹

**请求**
- 路径：`/api/favorites/folders/:id`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "message": "文件夹删除成功"
}
```

### 9. 获取文件夹中的收藏列表

**请求**
- 路径：`/api/favorites/folders/:id/favorites`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
[
  {
    "id": 1,
    "name": "网站名称",
    "url": "https://example.com",
    "description": "网站描述",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

## 农场游戏模块 (`/api/farm`)

### 1. 获取作物配置

**请求**
- 路径：`/api/farm/crops`
- 方法：GET
- 参数：
  - `category`：作物类别（可选）
  - `search`：搜索关键词（可选）

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "crop_key": "wheat",
      "name": "小麦",
      "category": "grain",
      "price": 10,
      "growth_time": 30,
      "exp": 5,
      "icon": "wheat.png",
      "stages": "seed|sprout|grown|mature"
    }
  ]
}
```

### 2. 初始化/获取玩家农场数据

**请求**
- 路径：`/api/farm/player/init`
- 方法：POST
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": {
    "player": {
      "id": 1,
      "user_id": 1,
      "level": 1,
      "exp": 0,
      "exp_to_next_level": 100,
      "gold": 1000,
      "last_check_in": "2024-01-01T00:00:00Z",
      "next_check_in_time": "2024-01-01T00:01:00Z",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    "plots": [
      {
        "id": 1,
        "player_id": 1,
        "plot_index": 0,
        "is_unlocked": true,
        "crop_key": null,
        "planted_at": "2024-01-01T00:00:00Z",
        "stage": 0,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ],
    "inventory": []
  }
}
```

### 3. 获取玩家农场数据

**请求**
- 路径：`/api/farm/player`
- 方法：GET
- 认证：需要JWT Token

**响应**：同初始化玩家农场数据

### 4. 更新玩家金币

**请求**
- 路径：`/api/farm/player/gold`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "amount": 100,
    "operation": "add" // add 或 subtract
  }
  ```

**响应**
```json
{
  "success": true,
  "gold": 1100,
  "message": "获得100金币"
}
```

### 5. 签到

**请求**
- 路径：`/api/farm/player/checkin`
- 方法：POST
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "gold": 1100,
  "inventory": [],
  "crop": {
    "crop_key": "wheat_seed",
    "name": "小麦",
    "icon": "wheat.png",
    "quantity": 1
  },
  "message": "签到成功！获得 小麦种子 x1，100金币",
  "nextCheckInTime": "2024-01-01T00:01:00Z"
}
```

### 6. 购买地块

**请求**
- 路径：`/api/farm/plots/unlock`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "plotIndex": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "成功消耗500金币解锁地块",
  "plots": [
    // 所有地块信息
  ]
}
```

### 7. 种植作物

**请求**
- 路径：`/api/farm/plots/plant`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "plotIndex": 0,
    "cropKey": "wheat_seed"
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "成功种植小麦",
  "player": {
    // 更新后的玩家数据
  },
  "plot": {
    // 更新后的地块信息
  },
  "inventory": [
    // 更新后的仓库信息
  ]
}
```

### 8. 收获作物

**请求**
- 路径：`/api/farm/plots/harvest`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "plotIndex": 0
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "收获小麦，获得5经验",
  "reward": {
    "exp": 5
  },
  "levelUp": false
}
```

### 9. 铲除作物

**请求**
- 路径：`/api/farm/plots/remove`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "plotIndex": 0
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "作物已铲除"
}
```

### 10. 获取地块状态

**请求**
- 路径：`/api/farm/plots/:plotIndex`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "plot": {
    "id": 1,
    "player_id": 1,
    "plot_index": 0,
    "is_unlocked": true,
    "crop_key": "wheat",
    "planted_at": "2024-01-01T00:00:00Z",
    "stage": 0,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "cropInfo": {
      "id": 1,
      "crop_key": "wheat",
      "name": "小麦",
      "category": "grain",
      "price": 10,
      "growth_time": 30,
      "exp": 5,
      "icon": "wheat.png",
      "stages": "seed|sprout|grown|mature",
      "currentStage": 0,
      "currentIcon": "seed",
      "progress": 0,
      "remainingSeconds": 30,
      "isMature": false
    }
  }
}
```

### 11. 获取仓库

**请求**
- 路径：`/api/farm/inventory`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "player_id": 1,
      "crop_key": "wheat",
      "quantity": 1,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "cropInfo": {
        "id": 1,
        "crop_key": "wheat",
        "name": "小麦",
        "category": "grain",
        "price": 10,
        "growth_time": 30,
        "exp": 5,
        "icon": "wheat.png",
        "stages": "seed|sprout|grown|mature"
      }
    }
  ]
}
```

### 12. 添加到仓库

**请求**
- 路径：`/api/farm/inventory/add`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "cropKey": "wheat",
    "quantity": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "获得1个物品"
}
```

### 13. 从仓库移除

**请求**
- 路径：`/api/farm/inventory/remove`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "cropKey": "wheat",
    "quantity": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "消耗1个物品"
}
```

### 14. 出售物品

**请求**
- 路径：`/api/farm/inventory/sell`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "cropKey": "wheat",
    "quantity": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "成功出售1个小麦",
  "player": {
    // 更新后的玩家数据
  },
  "inventory": [
    // 更新后的仓库信息
  ]
}
```

### 15. 购买种子

**请求**
- 路径：`/api/farm/shop/buy`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "cropKey": "wheat",
    "quantity": 1
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "成功购买1个小麦种子",
  "player": {
    // 更新后的玩家数据
  },
  "inventory": [
    // 更新后的仓库信息
  ]
}
```

### 16. 获取用户列表（好友列表）

**请求**
- 路径：`/api/farm/users`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `search`：搜索关键词（可选）

**响应**
```json
[
  {
    "id": 1,
    "username": "admin",
    "full_name": "管理员",
    "account_type": "admin",
    "created_at": "2024-01-01T00:00:00Z",
    "level": 1,
    "exp": 0,
    "gold": 1000
  }
]
```

## 版本管理模块 (`/api/versions`)

### 1. 获取版本文件列表

**请求**
- 路径：`/api/versions`
- 方法：GET

**响应**
```json
[
  {
    "name": "维修工单系统_v1.0.0_build2024.01.rar",
    "version": "v1.0.0",
    "build": "Build 2024.01",
    "date": "2024年1月",
    "size": "10.0 MB",
    "sizeBytes": 10485760,
    "downloadUrl": "/version/维修工单系统_v1.0.0_build2024.01.rar",
    "mtime": "2024-01-01T00:00:00Z"
  }
]
```

## 系统日志模块 (`/api/logs`)

### 1. 获取系统日志

**请求**
- 路径：`/api/logs`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认20）
  - `type`：日志类型（可选）
  - `level`：日志级别（可选）
  - `keyword`：关键词（可选）
  - `startDate`：开始日期（可选）
  - `endDate`：结束日期（可选）

**响应**
```json
{
  "logs": [
    {
      "id": 1,
      "log_type": "system",
      "log_level": "info",
      "message": "系统启动",
      "details": "系统正常启动",
      "user_id": 1,
      "is_public": true,
      "ip_address": "127.0.0.1",
      "user_agent": "Mozilla/5.0",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "totalPages": 1,
  "page": 1,
  "limit": 20,
  "levelCounts": {
    "info": 1
  }
}
```

### 2. 获取日志统计

**请求**
- 路径：`/api/logs/stats`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "stats": {
    "total": 1,
    "info": 1,
    "warning": 0,
    "error": 0,
    "debug": 0
  },
  "recentLogs": [
    // 最近5条日志
  ]
}
```

### 3. 获取单个日志详情

**请求**
- 路径：`/api/logs/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "id": 1,
  "log_type": "system",
  "log_level": "info",
  "message": "系统启动",
  "details": "系统正常启动",
  "user_id": 1,
  "is_public": true,
  "ip_address": "127.0.0.1",
  "user_agent": "Mozilla/5.0",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 4. 创建系统日志

**请求**
- 路径：`/api/logs`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员
- 参数：
  ```json
  {
    "log_type": "system",
    "log_level": "info",
    "message": "日志消息",
    "details": "详细信息",
    "user_id": 1,
    "is_public": true,
    "ip_address": "127.0.0.1",
    "user_agent": "Mozilla/5.0"
  }
  ```

**响应**
```json
{
  "id": 2,
  "message": "日志创建成功"
}
```

### 5. 删除系统日志

**请求**
- 路径：`/api/logs/:id`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "message": "日志删除成功"
}
```

### 6. 按类型获取日志

**请求**
- 路径：`/api/logs/type/:type`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认20）

**响应**
```json
{
  "logs": [
    // 日志列表
  ],
  "total": 1,
  "totalPages": 1,
  "page": 1,
  "limit": 20,
  "logType": "system"
}
```

### 7. 按级别获取日志

**请求**
- 路径：`/api/logs/level/:level`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `page`：页码（默认1）
  - `limit`：每页条数（默认20）

**响应**
```json
{
  "logs": [
    // 日志列表
  ],
  "total": 1,
  "totalPages": 1,
  "page": 1,
  "limit": 20,
  "logLevel": "info"
}
```

## 数据库备份模块 (`/api/backup`)

### 1. 创建备份

**请求**
- 路径：`/api/backup/create`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "success": true,
  "message": "备份成功",
  "filename": "backup_20240101_000000.sql",
  "filepath": "/backups/backup_20240101_000000.sql",
  "size": 1048576,
  "sizeText": "1.0 MB",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 2. 获取备份列表

**请求**
- 路径：`/api/backup/list`
- 方法：GET
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "backups": [
    {
      "filename": "backup_20240101_000000.sql",
      "filepath": "/backups/backup_20240101_000000.sql",
      "size": 1048576,
      "sizeText": "1.0 MB",
      "createdAt": "2024-01-01T00:00:00Z",
      "modifiedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 3. 下载备份文件

**请求**
- 路径：`/api/backup/download/:filename`
- 方法：GET
- 认证：需要JWT Token
- 权限：管理员

**响应**：SQL文件下载

### 4. 删除备份文件

**请求**
- 路径：`/api/backup/:filename`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "success": true,
  "message": "删除成功"
}
```

### 5. 还原备份

**请求**
- 路径：`/api/backup/restore/:filename`
- 方法：POST
- 认证：需要JWT Token
- 权限：管理员

**响应**
```json
{
  "success": true,
  "message": "还原成功",
  "filename": "backup_20240101_000000.sql",
  "restoredAt": "2024-01-01T00:00:00Z"
}
```

### 6. 获取备份统计

**请求**
- 路径：`/api/backup/stats`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "totalBackups": 1,
  "totalSize": 1048576,
  "totalSizeText": "1.0 MB",
  "latestBackup": "2024-01-01T00:00:00Z"
}
```

## 文件存储模块 (`/api/storage`)

### 1. 上传文件

**请求**
- 路径：`/api/storage/upload`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  - `file`：文件（multipart/form-data，最大50MB）
  - `directory`：目录（可选）
  - `storageType`：存储类型（public/private，默认private）
  - `overwrite`：是否覆盖（可选）
  - `filename`：覆盖文件名（可选）

**响应**
```json
{
  "success": true,
  "message": "文件上传成功",
  "file": {
    "filename": "example.txt",
    "path": "/uploads/box/1/example.txt",
    "size": 1024,
    "uploadTime": "2024-01-01T00:00:00Z",
    "storageType": "private"
  }
}
```

### 2. 获取文件列表

**请求**
- 路径：`/api/storage/files`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）
  - `directory`：目录（可选）

**响应**
```json
{
  "success": true,
  "files": [
    {
      "filename": "example.txt",
      "path": "/uploads/box/1/example.txt",
      "size": 1024,
      "uploadTime": "2024-01-01T00:00:00Z",
      "storageType": "private",
      "type": "file"
    }
  ],
  "folders": [
    {
      "filename": "docs",
      "path": "/uploads/box/1/docs",
      "createTime": "2024-01-01T00:00:00Z",
      "storageType": "private",
      "type": "folder"
    }
  ],
  "storageType": "private",
  "currentDirectory": ""
}
```

### 3. 下载文件

**请求**
- 路径：`/api/storage/download/:filename`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）
  - `directory`：目录（可选）

**响应**：文件下载

### 4. 下载文件夹（ZIP压缩）

**请求**
- 路径：`/api/storage/download-folder/:foldername`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）
  - `directory`：目录（可选）

**响应**：ZIP文件下载

### 5. 删除文件

**请求**
- 路径：`/api/storage/files/:filename`
- 方法：DELETE
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）
  - `directory`：目录（可选）

**响应**
```json
{
  "success": true,
  "message": "文件删除成功"
}
```

### 6. 创建文件夹

**请求**
- 路径：`/api/storage/folders`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "folderName": "新文件夹",
    "storageType": "private",
    "directory": ""
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "文件夹创建成功",
  "folder": {
    "filename": "新文件夹",
    "path": "/uploads/box/1/新文件夹",
    "createTime": "2024-01-01T00:00:00Z",
    "storageType": "private",
    "type": "folder"
  }
}
```

### 7. 删除文件夹

**请求**
- 路径：`/api/storage/folders/:folderName`
- 方法：DELETE
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）
  - `directory`：目录（可选）

**响应**
```json
{
  "success": true,
  "message": "文件夹删除成功"
}
```

### 8. 获取文件夹列表

**请求**
- 路径：`/api/storage/folders`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `storageType`：存储类型（public/private，默认private）

**响应**
```json
{
  "success": true,
  "folders": [
    {
      "filename": "docs",
      "relativePath": "docs",
      "path": "/uploads/box/1/docs",
      "createTime": "2024-01-01T00:00:00Z",
      "storageType": "private",
      "type": "folder",
      "level": 0
    }
  ],
  "storageType": "private",
  "currentDirectory": ""
}
```

### 9. 移动文件或文件夹

**请求**
- 路径：`/api/storage/move`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "filename": "example.txt",
    "sourcePath": "",
    "targetPath": "docs",
    "sourceStorageType": "private",
    "targetStorageType": "private",
    "overwrite": false,
    "createCopy": false,
    "itemType": "file"
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "文件移动成功",
  "item": {
    "filename": "example.txt",
    "sourcePath": "",
    "targetPath": "docs",
    "sourceStorageType": "private",
    "targetStorageType": "private",
    "itemType": "file",
    "overwritten": false,
    "createCopy": false
  }
}
```

## 便签管理模块 (`/api/notes`)

### 1. 获取便签列表

**请求**
- 路径：`/api/notes`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "便签标题",
      "content": "便签内容",
      "color": "yellow",
      "is_pinned": false,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 2. 获取单个便签

**请求**
- 路径：`/api/notes/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "便签标题",
    "content": "便签内容",
    "color": "yellow",
    "is_pinned": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### 3. 创建便签

**请求**
- 路径：`/api/notes`
- 方法：POST
- 认证：需要JWT Token
- 参数：
  ```json
  {
    "title": "便签标题",
    "content": "便签内容",
    "color": "yellow",
    "is_pinned": false
  }
  ```

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "便签标题",
    "content": "便签内容",
    "color": "yellow",
    "is_pinned": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "message": "便签创建成功"
}
```

### 4. 更新便签

**请求**
- 路径：`/api/notes/:id`
- 方法：PUT
- 认证：需要JWT Token
- 参数：同创建便签（可选字段）

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "新便签标题",
    "content": "新便签内容",
    "color": "blue",
    "is_pinned": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-02T00:00:00Z"
  },
  "message": "便签更新成功"
}
```

### 5. 切换便签置顶状态

**请求**
- 路径：`/api/notes/:id/pin`
- 方法：PUT
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "便签标题",
    "content": "便签内容",
    "color": "yellow",
    "is_pinned": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-02T00:00:00Z"
  },
  "is_pinned": true,
  "message": "便签已置顶"
}
```

### 6. 删除便签

**请求**
- 路径：`/api/notes/:id`
- 方法：DELETE
- 认证：需要JWT Token

**响应**
```json
{
  "success": true,
  "message": "便签删除成功"
}
```

## 公司信息模块 (`/api/company-info`)

### 1. 获取公司信息

**请求**
- 路径：`/api/company-info`
- 方法：GET

**响应**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "company_name": "维修工单系统",
    "company_address": "北京市朝阳区",
    "contact_phone": "13800138000",
    "logo_path": "/uploads/company/logo_1678900000000.png",
    "favicon_path": "/uploads/company/favicon_1678900000000.ico"
  }
}
```

### 2. 更新公司信息

**请求**
- 路径：`/api/company-info`
- 方法：PUT
- 参数：
  ```json
  {
    "company_name": "维修工单系统",
    "company_address": "北京市朝阳区",
    "contact_phone": "13800138000"
  }
  ```

**响应**
```json
{
  "success": true,
  "message": "公司信息更新成功"
}
```

### 3. 上传公司LOGO

**请求**
- 路径：`/api/company-info/upload-logo`
- 方法：POST
- 参数：
  - `logo`：图片文件（multipart/form-data，最大5MB）

**响应**
```json
{
  "success": true,
  "message": "LOGO上传成功",
  "data": {
    "logo_path": "/uploads/company/logo_1678900000000.png",
    "favicon_path": "/uploads/company/favicon_1678900000000.ico"
  }
}
```

### 4. 删除LOGO

**请求**
- 路径：`/api/company-info/logo`
- 方法：DELETE

**响应**
```json
{
  "success": true,
  "message": "LOGO删除成功"
}
```

## 服务地址模块 (`/api/addresses`)

### 1. 获取单个服务地址

**请求**
- 路径：`/api/addresses/:id`
- 方法：GET
- 认证：需要JWT Token

**响应**
```json
{
  "id": 1,
  "address": "北京市朝阳区",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 2. 获取服务地址列表

**请求**
- 路径：`/api/addresses`
- 方法：GET
- 认证：需要JWT Token
- 参数：
  - `search`：搜索关键词（可选）
  - `page`：页码（默认1）
  - `limit`：每页条数（默认10）

**响应**
```json
{
  "addresses": [
    {
      "id": 1,
      "address": "北京市朝阳区",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "totalCount": 1,
  "currentPage": 1,
  "pageSize": 10,
  "totalPages": 1
}
```

### 3. 添加服务地址

**请求**
- 路径：`/api/addresses`
- 方法：POST
- 认证：需要JWT Token
- 权限：地址管理
- 参数：
  ```json
  {
    "address": "北京市朝阳区",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
  ```

**响应**
```json
{
  "message": "服务地址添加成功",
  "addressId": 1
}
```

### 4. 更新服务地址

**请求**
- 路径：`/api/addresses/:id`
- 方法：PUT
- 认证：需要JWT Token
- 权限：地址管理
- 参数：
  ```json
  {
    "address": "北京市海淀区",
    "updated_at": "2024-01-02T00:00:00Z"
  }
  ```

**响应**
```json
{
  "message": "服务地址更新成功"
}
```

### 5. 删除服务地址

**请求**
- 路径：`/api/addresses/:id`
- 方法：DELETE
- 认证：需要JWT Token
- 权限：地址管理

**响应**
```json
{
  "message": "服务地址删除成功"
}
```

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-01-01 | 初始版本 |
| 1.1 | 2024-06-01 | 新增物料申请模块 |
| 1.2 | 2024-12-01 | 新增聊天模块 |
| 1.3 | 2026-01-21 | 新增收藏、农场、版本、日志、备份、存储、便签、公司信息、服务地址模块 |
