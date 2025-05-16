# Range-Based Actions API Documentation

This document describes how to use the range-based actions API to perform operations on multiple line items at once. The API supports both direct actions and AI-driven actions based on natural language prompts.

## Endpoint

```
POST /api/agent/range-action
```

## Authentication

This endpoint requires authentication. Include a valid JWT token in the `Authorization` header.

## Request Body

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| projectId | string | Yes      | The ID of the project containing the line items  |
| action    | string | Yes      | The action to perform: 'update', 'delete', or 'duplicate' |
| range     | object | Yes      | Range of items to affect `{ start: number, end: number }` |
| data      | object | No*      | Data for update operation (required for 'update' action) |

*Note: The `data` parameter is required when the action is 'update'.

## Actions

### 1. Update Items

Update properties of multiple items in the specified range.

**Example Request:**

```javascript
{
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "action": "update",
  "range": {
    "start": 5,
    "end": 15
  },
  "data": {
    "category": "Materials",
    "unit_price": 25.99
  }
}
```

**Response:**

```json
{
  "success": true,
  "action": "update",
  "range": {
    "start": 5,
    "end": 15
  },
  "affectedCount": 11,
  "updatedItems": [
    // Array of all line items after the update
  ]
}
```

### 2. Delete Items

Delete multiple items in the specified range.

**Example Request:**

```javascript
{
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "action": "delete",
  "range": {
    "start": 5,
    "end": 15
  }
}
```

**Response:**

```json
{
  "success": true,
  "action": "delete",
  "range": {
    "start": 5,
    "end": 15
  },
  "affectedCount": 11,
  "updatedItems": [
    // Array of all remaining line items
  ]
}
```

### 3. Duplicate Items

Duplicate items in the specified range and append them to the end of the list.

**Example Request:**

```javascript
{
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "action": "duplicate",
  "range": {
    "start": 5,
    "end": 15
  }
}
```

**Response:**

```json
{
  "success": true,
  "action": "duplicate",
  "range": {
    "start": 5,
    "end": 15
  },
  "affectedCount": 11,
  "updatedItems": [
    // Array of all line items including the new duplicates
  ]
}
```

## Error Responses

### 400 Bad Request

- Missing required fields
- Invalid range format
- Invalid action type
- Missing data for update action

```json
{
  "error": "Error message describing the issue"
}
```

### 404 Not Found

- Project not found
- No line items in the specified range

```json
{
  "error": "No line items found in the specified range"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to process range action",
  "details": "Detailed error message"
}
```

## Frontend Implementation Example

Here's how you might implement range selection and actions in your frontend:

```javascript
// Example using fetch API
async function performRangeAction(projectId, action, range, data = null) {
  try {
    const response = await fetch('/api/agent/range-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        projectId,
        action,
        range,
        ...(data && { data })
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to perform action');
    }

    return await response.json();
  } catch (error) {
    console.error('Error performing range action:', error);
    throw error;
  }
}

// Example usage
const handleRangeUpdate = async () => {
  try {
    const result = await performRangeAction(
      '123e4567-e89b-12d3-a456-426614174000',
      'update',
      { start: 5, end: 15 },
      { category: 'Materials', unit_price: 25.99 }
    );
    
    console.log('Update successful:', result);
    // Update your UI with the new items
    updateLineItems(result.updatedItems);
  } catch (error) {
    // Handle error
    alert(error.message);
  }
};
```

## AI-Driven Range Actions

In addition to direct actions, the API supports AI-driven range actions where you can provide a natural language prompt to modify items in a range.

### Endpoint

```
POST /api/agent/range-action
```

### Request Body

| Parameter   | Type   | Required | Description                                      |
|-------------|--------|----------|--------------------------------------------------|
| projectId   | string | Yes      | The ID of the project containing the line items  |
| range       | object | Yes      | Range of items to affect `{ start: number, end: number }` |
| prompt      | string | Yes      | Natural language prompt describing the changes   |
| xmlResponse | string | No       | Optional pre-generated XML response (for testing)|

### Example Request

```javascript
{
  "projectId": "123e4567-e89b-12d3-a456-426614174000",
  "range": {
    "start": 3,
    "end": 5
  },
  "prompt": "due to tariffs these materials have add 11% in cost"
}
```

### Example Response

```json
{
  "success": true,
  "prompt": "due to tariffs these materials have add 11% in cost",
  "range": {
    "start": 3,
    "end": 5
  },
  "actionSummary": {
    "itemsAdded": 0,
    "itemsUpdated": 3,
    "itemsDeleted": 0,
    "errors": []
  },
  "updatedItems": [
    // Array of all line items after the update
  ]
}
```

### XML Response Format

The AI generates an XML response with actions to perform. The format is:

```xml
<estimate>
  <actions>
    <action>+ ID:62, amount=3330.0</action>
    <action>+ ID:63, amount=1665.0</action>
    <action>+ ID:64, amount=2220.0</action>
  </actions>
</estimate>
```

Each action follows this format:
- `+` indicates an update operation
- `ID:XX` specifies which item to update
- The rest of the string contains field=value pairs to update

The system will parse these actions and apply them to the specified items.

## Best Practices

1. **Pagination**: For large ranges, consider implementing pagination in your frontend to avoid performance issues.
2. **Undo/Redo**: Consider implementing undo/redo functionality since these actions affect multiple items.
3. **Confirmation**: Always ask for confirmation before performing destructive actions like delete.
4. **Loading States**: Show loading indicators while the action is being processed.
5. **Error Handling**: Provide clear error messages to the user when something goes wrong.
6. **Rate Limiting**: Be aware that updating many items at once might hit rate limits.
7. **AI Prompts**: When using AI-driven actions, make prompts clear and specific about what changes you want to make.
8. **Review AI Changes**: Always review the changes suggested by the AI before applying them, especially for critical financial data.
