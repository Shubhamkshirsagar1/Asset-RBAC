import { DataTypes } from 'sequelize';

// Shared column/option helpers so every model file stays consistent.
export const id = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
export const base = { timestamps: false, freezeTableName: true };
export const fk = (model) => ({ type: DataTypes.UUID, allowNull: false, references: { model, key: 'id' } });
export const fkNull = (model) => ({ type: DataTypes.UUID, allowNull: true, references: { model, key: 'id' } });

// Common columns shared by Grant and UserGrant.
export const grantFields = {
  resourceTypeKey: { type: DataTypes.STRING, allowNull: false },
  actionKey: { type: DataTypes.STRING, allowNull: false },
  effect: { type: DataTypes.ENUM('allow', 'deny'), allowNull: false, defaultValue: 'allow' },
  scope: { type: DataTypes.ENUM('own', 'dept', 'facility', 'tenant', 'any'), allowNull: false, defaultValue: 'any' },
  condition: { type: DataTypes.JSONB, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
};
