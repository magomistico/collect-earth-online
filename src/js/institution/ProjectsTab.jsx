import React, { useMemo, useState, useEffect } from "react";
import DataTable from "react-data-table-component";
import SvgIcon from "../components/svg/SvgIcon";
import { BulkActions } from "../components/BulkActions";
import { getNextInSequence, } from "../utils/sequence";

import '../../css/institution.css';

export const ProjectsTab = ({
  institutionId,
  projectList = [],
  projectDrafts = [],
  isAdmin,
  deleteDraftProjects,
  deleteProjectsBulk,  
  editProjectsBulk,
  downloadProjectsBulk,
}) => {  
  const [selectedRows, setSelectedRows] = useState([]);
  const [filterText, setFilterText] = useState("");
  const visibilityOptions = [
    { value: "public", label: "Public: All Users" },
    { value: "users", label: "Users: Logged In Users" },
    { value: "institution", label: "Institution: Group Members" },
    { value: "private", label: "Private: Group Admins" },
  ];
  
  const filteredProjects = useMemo(() => {
    const idOffset =  getNextInSequence(projectList.map((e)=>e.id));
    const lower = filterText.toLowerCase();
    return projectList.concat(projectDrafts.map((p)=>{return {... p, isDraft: true,
      draftId: p.id,
      id: (Number(p.id) + idOffset)};}))
      .filter((p) => p.name?.toLowerCase().includes(lower));
  }, [projectList, projectDrafts, filterText]);

  const columns = useMemo(
    () => [
      {
        name: "Visibilidad",
        selector: (row) => row.isDraft ? 'Borrador' : row.privacyLevel || "—",
        sortable: true,
        width: "120px",
        grow: 0.8,
      },
      {
        name: "Nombre del Proyecto / Formulario",
        selector: (row) => row.name,
        sortable: true,
        sortFunction: (rowA, rowB) => {
          const a = rowA.title?.toLowerCase() || "";
          const b = rowB.title?.toLowerCase() || "";
          return a.localeCompare(b);
        },
        grow: 2,
        cell: (row) => (
	  <a
	    className="projects-table-name"
	    href={row.isDraft ? `/project-wizard?draftId=${row.draftId}&institutionId=${institutionId}` :
	      isAdmin ?
		`/project-wizard?projectId=${row.id}&institutionId=${institutionId}`
		: `/collection?projectId=${row.id}&institutionId=${institutionId}`}>
	    {row.name}
	  </a>
	),
      },
      {
        name: "Fecha de Creación",
        width: "160px",
        selector: (row) => row.createdDate,
        sortable: true,
        id: "createdDate",
        sortFunction: (rowA, rowB) => {
          const a = rowA.createdDate || "";
          const b = rowB.createdDate || "";
          return a < b ? -1 : a > b ? 1 : 0;
        },
        cell: (row) =>
          row.createdDate
            ? row.createdDate
            : "—",
      },
      {
        name: "Total Parcelas",
        width: "140px",
        selector: (row) => row.numPlots ?? 0,
        sortable: true,
        right: true,
      },
      {
        name: "Avance %",
        width: "160px",
        selector: (row) => row.percentComplete ?? -1, 
        sortable: true,
        right: true,
        cell: (row) => row.percentComplete != null
          ? `${Number(row.percentComplete).toFixed(2)}%`
          : "—",
        sortFunction: (rowA, rowB) => {
          const a = rowA.percentComplete ?? -1;
          const b = rowB.percentComplete ?? -1;
          return a - b;
        },
      },
      {
        name: "Estado",
        width: "140px",
        selector: (row) => row.isDraft ? 'Borrador' : row.availability ?? "No publicado",
        sortable: true,
      },
      
      {
        omit: !isAdmin,
        width: "60px",
        name: "Editar",
        grow: .2,
        cell: (row)=> <div
                        className="edit-button"
                        onClick={()=> {
                          if(row.isDraft){
                            window.location.assign(`/project-wizard?draftId=${row.draftId}&institutionId=${institutionId}`);
                          } else {
                            window.location.assign(`/project-wizard?projectId=${row.id}&institutionId=${institutionId}`);
                          }
		        }}
        >
                        <SvgIcon icon="edit" size="1.2rem"/>
                      </div>
      },
      {width: "130px",
        cell: (row)=> !row.isDraft &&
          <input
            className="btn btn-outline-darkgreen btn-sm w-100"
            onClick={() => window.open(`/collection?projectId=${row.id}&institutionId=${institutionId}`)
            }
            type="button"
            value="Validar"
          />}
    ],
    [isAdmin]
  );
  
  const customStyles = {
    headCells: {
      style: {
        backgroundColor: "#f0f2f1",
        fontWeight: 600,
        fontSize: "0.9rem",
      },
    },
    rows: {
      style: {
        minHeight: "48px",
        "&:hover": { backgroundColor: "#f7f9f8" },
      },
    },
  };

  const handleDelete = () => {
    
    const selectedProjects = selectedRows.map((r) => !r.isDraft && r.id).filter((e)=>e);
    const selectedDrafts = selectedRows.map((r) => r.isDraft && r.draftId).filter((e)=>e);
    if (selectedRows.length === 0) return;
    selectedProjects.length && deleteProjectsBulk(selectedRows.map((r) => !r.isDraft && r.id).filter((e)=>e));
    selectedDrafts.length && deleteDraftProjects(selectedRows.map((r) => r.isDraft && r.draftId).filter((e)=>e));
  };

  const handleDownload = (selectedFiles) => {
    // Drafts have nothing to download, and their table ids are offset (not real project ids).
    const projectIds = selectedRows.filter((r) => !r.isDraft).map((r) => r.id);
    if (projectIds.length === 0) return;
    downloadProjectsBulk(projectIds, selectedFiles);
  };

  const conditionalRowStyles = [
    { // Simplified: Blue
      when: row => row.type === "simplified",
      style: {
        borderLeft: '4px solid #9286D3',
      },
    },
    { // Draft Project: blank border
      when: row => row.isDraft,
      style: {
        borderLeft: 'none'}},
    { // No Plots Collected: Red
      when: row => row.type !== "simplified" && row.percentComplete == 0,
      style: {
        borderLeft: '4px solid #D98EB2',
      },
    },
    { // Some Plots Collected: Yellow
      when: row => row.type !== "simplified" && (100 > row.percentComplete && row.percentComplete > 0),
      style: {
        borderLeft: '4px solid #FEBD5B',
      },
    },
    { // All Plots Collected: Green
      when: row => row.type !== "simplified" &&  row.percentComplete == 100,
      style: {
        borderLeft: '4px solid #84D0AC',
      },
    },  
  ];
  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2 className="tab-title">
          Proyectos y Formularios ({projectList.length})
        </h2>

        {isAdmin && (
          <button
            id="new-project-button"
            className="filled-button"
            onClick={() => window.location.assign(`/project-wizard?institutionId=${institutionId}`)}
          >
            <SvgIcon icon="plus" size="1rem" />
            Crear Nuevo Proyecto
          </button>
        )}
      </div>

      <div className="tab-filter">
        <input
          type="text"
          placeholder="Buscar proyecto por nombre..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>
      
      <div className="projects-legend">
        {[
          ["Sin parcelas validadas", "#D98EB2"],
          ["Validación en progreso", "#FEBD5B"],
          ["Validación completada (100%)", "#84D0AC"],
          ["Simplificado", "#9286D3"]
        ].map(([title, color]) => (
          <div key={title} className="projects-legend-item">
            <span className="projects-legend-symbol" style={{ color }}>⯀</span>
            <span className="projects-legend-label">: {title}</span>
          </div>
        ))}
      </div>

      {isAdmin && (
        <BulkActions
          isAdmin={isAdmin}
          visibilityOptions={visibilityOptions}
          showDownload={true}
          onChangeVisibility={editProjectsBulk}
          onDownload={handleDownload}
          onDelete={handleDelete}
          selectedRows={selectedRows}
        />
      )}

      <DataTable
        columns={columns}
        data={filteredProjects}
        selectableRows
        onSelectedRowsChange={({ selectedRows }) => setSelectedRows(selectedRows)}
        defaultSortFieldId="createdDate"
        defaultSortAsc={false}
        pagination
        paginationPerPage={100}
        paginationRowsPerPageOptions={[25, 50, 100, 250]}
        highlightOnHover
        conditionalRowStyles={conditionalRowStyles}
        customStyles={customStyles}
        noDataComponent="No se encontraron proyectos registrados."
        sortIcon={<SvgIcon icon="downCaret" size="0.9rem" />}
      />
    </div>
  );
};
