import React, { useMemo, useState } from "react";
import DataTable from "react-data-table-component";
import { BulkActions } from "../components/BulkActions";
import SvgIcon from "../components/svg/SvgIcon";
import Modal from "../components/Modal";

import "../../css/institution.css";

export const UsersTab = ({
  usersList = [],
  editUsersBulk,
  addUsersBulk,
  isAdmin,
  showRequestMembership,
  requestMembership,
}) => {
  const [selectedRows, setSelectedRows] = useState([]);
  const [filterText, setFilterText] = useState("");
  const [showAddUsers, setShowAddUsers] = useState(false);

  const filteredUsers = useMemo(() => {
    const lower = filterText.toLowerCase();
    return usersList.filter((u) => u.email?.toLowerCase().includes(lower));
  }, [usersList, filterText]);

  const columns = useMemo(
    () => [
      {
        name: "Email",
        selector: (row) => row.email,
        sortable: true,
        grow: 2,
        cell: (row) => (
          <span style={{ color: "#ffffff", fontWeight: 600 }}>{row.email}</span>
        ),
      },
      {
        name: "Rol",
        selector: (row) => row.institutionRole || "—",
        sortable: true,
        width: "140px",
        grow: 1,
        cell: (row) => (
          <span
            style={{
              padding: "3px 9px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
              background: row.institutionRole === "admin" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.06)",
              color: row.institutionRole === "admin" ? "#6ee7b7" : "#d4d4d8",
              border: `1px solid ${row.institutionRole === "admin" ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.12)"}`,
              textTransform: "capitalize",
            }}
          >
            {row.institutionRole || "—"}
          </span>
        ),
      },
      {
        omit: !isAdmin,
        name: "Actions",
        width: "120px",
        cell: (row) => (
          <button
            className="outlined-btn"
            onClick={() =>
              window.location.assign(`/account?accountId=${row.id}`)
            }
          >
            View User Stats
          </button>
        ),
        ignoreRowClick: true,
        allowOverflow: true,
        button: true,
      },
    ],
    [isAdmin]
  );

  const customStyles = {
    table: {
      style: {
        backgroundColor: "transparent",
        color: "#f4f4f5",
      },
    },
    tableWrapper: {
      style: {
        backgroundColor: "#0b100c",
        borderRadius: "14px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
      },
    },
    headRow: {
      style: {
        backgroundColor: "#111813",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        minHeight: "52px",
      },
    },
    headCells: {
      style: {
        color: "#9ed999",
        fontWeight: 700,
        fontSize: "0.82rem",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      },
    },
    rows: {
      style: {
        minHeight: "56px",
        backgroundColor: "#0b100c",
        color: "#f4f4f5",
        fontSize: "0.92rem",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        "&:hover": {
          backgroundColor: "#131d16 !important",
          cursor: "pointer",
        },
      },
    },
    pagination: {
      style: {
        backgroundColor: "#111813",
        color: "#e4e4e7",
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        minHeight: "52px",
      },
      pageButtonsStyle: {
        fill: "#9ed999",
        "&:disabled": {
          fill: "rgba(255, 255, 255, 0.2)",
        },
        "&:hover:not(:disabled)": {
          backgroundColor: "rgba(255, 255, 255, 0.1)",
        },
      },
    },
  };

  const handleRemove = () => {
    if (selectedRows.length === 0) return;
    editUsersBulk(selectedRows.map((r) => r.id), "not-member");
  };

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2 className="tab-title">
          Users ({usersList.length})
        </h2>

        <div className="tab-header-actions" style={{ display: 'flex', gap: '1rem' }}>
          {showRequestMembership && (
            <button
              className="filled-button"
              onClick={requestMembership}
            >
              Request Membership
            </button>
          )}

          {isAdmin && (
            <button
              className="filled-button"
              onClick={() => setShowAddUsers(true)}
            >
              <SvgIcon icon="plus" size="1rem" />
              Add User
            </button>
          )}
        </div>
      </div>

      <div className="tab-filter">
        <input
          type="text"
          placeholder="Search by email"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {isAdmin && (
        <BulkActions
          isAdmin={isAdmin}
          showDownload={false}
          buttonText={"Change Role"}
          visibilityOptions={["admin", "member"]}
          onChangeVisibility={editUsersBulk}
          onDelete={handleRemove}
          selectedRows={selectedRows}
        />
      )}

      <DataTable
        columns={columns}
        data={filteredUsers}
        selectableRows
        onSelectedRowsChange={({ selectedRows }) => setSelectedRows(selectedRows)}
        pagination
        paginationPerPage={100}
        paginationRowsPerPageOptions={[25, 50, 100, 250]}
        highlightOnHover
        customStyles={customStyles}
        noDataComponent="No users found."
        sortIcon={<SvgIcon icon="downCaret" size="0.9rem" />}
      />

      {showAddUsers && (
        <AddUsersModal
          onClose={() => setShowAddUsers(false)}
          onAdd={(rows) => addUsersBulk(rows)}
        />
      )}
    </div>
  );
};

export const AddUsersModal = ({ onClose, onAdd }) => {
  const [rows, setRows] = useState([
    { email: "", role: "admin" },
  ]);

  const addRow = () =>
    setRows((prev) => [...prev, { email: "", role: "admin" }]);

  const updateRow = (index, key, value) =>
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      )
    );

  const deleteRow = (index) =>
    setRows((prev) => prev.filter((_, i) => i !== index));

  const handleConfirm = () => {
    onAdd(rows);
    onClose();
  };

  return (
    <Modal
      title="Add Users"
      closeText="Cancel"
      confirmText="Add Users"
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <div className="add-users-container">
        {rows.map((row, i) => (
          <div key={i} className="add-users-row">
            <div>
              <label className="form-label">
                Email Address <span className="required">*</span>
              </label>
              <input
                type="email"
                className="form-control"
                placeholder="Enter"
                value={row.email}
                onChange={(e) => updateRow(i, "email", e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">
                Role <span className="required">*</span>
              </label>
              <select
                className="form-control"
                value={row.role}
                onChange={(e) => updateRow(i, "role", e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>

            {rows.length > 1 && (
              <button
                className="remove-user-btn"
                onClick={() => deleteRow(i)}
              >
                <SvgIcon icon="trash" size="1rem" color="#C62828" />
              </button>
            )}
          </div>
        ))}

        <button className="add-user-btn" onClick={addRow}>
          <SvgIcon icon="plus" size="1rem" />
          Add User
        </button>
      </div>
    </Modal>
  );
};
