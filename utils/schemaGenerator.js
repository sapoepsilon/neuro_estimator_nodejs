/**
 * Utility functions for generating schemas based on database structure
 */

/**
 * Generate a schema object for the estimate items based on the database structure
 * This can be used to ensure consistency between frontend and backend
 * @returns {Object} The schema object representing the estimate items structure
 */
function generateEstimateItemsSchema() {
  // Schema based on the estimate_items table structure
  return {
    id: "number",
    project_id: "number",
    title: "string",
    description: "string",
    quantity: "number",
    unit_price: "number",
    unit_type: "string",
    cost_type: "string",
    amount: "number",
    currency: "string",
    total_amount: "number",
    status: "string",
    parent_item_id: "number",
    is_sub_item: "boolean",
    data: "object",
  };
}

/**
 * Generate an XML template for Gemini based on the database structure
 * @returns {string} XML template string
 */
function generateGeminiXmlTemplate() {
  return `
<estimate>
  <project_title>Title of the estimate</project_title>
  <currency>USD</currency>
  <actions>
    <action>+ description='Description of item', quantity=1, unit_price=100, amount=100, unit_type='hour', cost_type='labor'</action>
    <action>+ description='Another item with sub-items', quantity=1, unit_price=200, amount=200, unit_type='each', cost_type='material'</action>
    <action>+ description='Sub-item 1', quantity=2, unit_price=50, amount=100, parent='Another item with sub-items', is_sub_item=true</action>
  </actions>
</estimate>
  `;
}

/**
 * Generate a sample instruction for updating an existing item
 * @param {number} itemId - The ID of the item to update
 * @returns {string} Sample instruction string
 */
function generateUpdateInstruction(itemId) {
  return `+ ID:${itemId}, description='Updated description', quantity=2, unit_price=150, amount=300`;
}

/**
 * Generate a sample instruction for deleting an existing item
 * @param {number} itemId - The ID of the item to delete
 * @returns {string} Sample instruction string
 */
function generateDeleteInstruction(itemId) {
  return `- ID:${itemId}`;
}

/**
 * Generate a response structure template that matches the database schema
 * This can be used to ensure consistency between what Gemini generates and what the database expects
 * @returns {Object} Response structure template
 */
function generateResponseStructureTemplate() {
  return {
    estimate: {
      title: "Title of the estimate",
      totalAmount: 0,
      currency: "USD",
      lineItems: [
        {
          description: "Description of item",
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          unitType: "hour",
          costType: "labor",
          subItems: [
            {
              description: "Description of sub-item",
              quantity: 1,
              unitPrice: 50,
              amount: 50,
              unitType: "hour",
              costType: "labor",
            },
          ],
        },
      ],
    },
  };
}

export {
  generateEstimateItemsSchema,
  generateGeminiXmlTemplate,
  generateUpdateInstruction,
  generateDeleteInstruction,
  generateResponseStructureTemplate,
};
