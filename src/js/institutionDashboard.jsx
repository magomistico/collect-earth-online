import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import DataTable from "react-data-table-component";
import SvgIcon from "./components/svg/SvgIcon";
import Modal from "./components/Modal";

import { LoadingModal, NavigationBar, BreadCrumbs } from "./components/PageComponents";


const InstitutionDashboard = ({ institutionId }) => {
  const [projectList, setProjectList] = useState([]);
  const [modalMessage, setModalMessage] = useState(null);
  const [modal, setModal] = useState(null);
  const [filterText, setFilterText] = useState("");

  /// Lifecycle

  useEffect(() => {
    processModal(
      "Loading project list",
      getProjectList().catch((response) => {
        console.error(response);
        setModal({
          alert: {
            alertType: "Project Lst Retrieval Error",
            alertMessage: "Error retrieving the project list. See console for details.",
          },
        });
      })
    );
  }, []);

  /// API Calls

  const getProjectList = () =>
    fetch(`/get-institution-dash-projects?institutionId=${institutionId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data) => setProjectList(data));

  /// Helpers

  const processModal = (message, promise) => {
    setModalMessage(message);
    promise.finally(() => setModalMessage(null));
  };

  const columns = [
    {
      name: "ID",
      selector: (row) => row.id,
      sortable: true,
      width: "100px",
    },
    {
      name: "Nombre del Proyecto",
      selector: (row) => row.name,
      minWidth: "15rem",
      sortable: true,
    },
    {
      name: "Usuarios Asignados",
      selector: (row) => row.stats.usersAssigned,
      center: true,
      sortable: true,
    },
    {
      name: "Colaboradores",
      selector: (row) => row.stats.contributors,
      center: true,
      sortable: true,
    },
    {
      name: "Total Parcelas",
      selector: (row) => row.stats.totalPlots,
      center: true,
      sortable: true,
    },
    {
      name: "Asignaciones",
      selector: (row) => row.stats.plotAssignments,
      center: true,
      sortable: true,
    },
    {
      name: "Marcadas",
      selector: (row) => row.stats.flaggedPlots,
      center: true,
      sortable: true,
    },
    {
      name: "Analizadas",
      selector: (row) => row.stats.analyzedPlots,
      center: true,
      sortable: true,
    },
    {
      name: "Parciales",
      selector: (row) => row.stats.partialPlots,
      center: true,
      sortable: true,
    },
    {
      name: "Sin Analizar",
      selector: (row) => row.stats.unanalyzedPlots,
      center: true,
      sortable: true,
    },
  ];

  const filteredItems = useMemo(() => {
    return projectList.filter(
      (item) =>
        item.name &&
          item.name.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [filterText, projectList]);

  const subHeaderComponentMemo = useMemo(() => {
    const handleExport = () => {
      let csv = "Project Id,Project Name,Users Assigned,Contributors,Total Plots,Plot Assignments,Flagged Plots,Analyzed Plots,Partial Plots,Unanalyzed Plots\n";
      filteredItems.forEach((row) => {
        csv += `${row.id},"${row.name}",${row.stats.usersAssigned},${row.stats.contributors},${row.stats.totalPlots},${row.stats.plotAssignments},${row.stats.flaggedPlots},${row.stats.analyzedPlots},${row.stats.partialPlots},${row.stats.unanalyzedPlots}\n`;
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "institution_projects_export.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    return (
      <div className="d-flex w-100 justify-content-start align-items-center">
        <input
          type="text"
          placeholder="Filtrar por nombre de proyecto..."
          className="form-control"
          style={{ width: "260px", marginRight: "10px" }}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <button 
          className="btn bg-darkgreen text-white" 
          onClick={handleExport}
        >
          Exportar CSV
        </button>
      </div>
    );
  }, [filterText, filteredItems]);

  return (
    <div className="row justify-content-center" id="institution-dashboard">
      {modalMessage && <LoadingModal message={modalMessage} />}
      {modal?.alert && (
        <Modal title={modal.alert.alertType} onClose={() => setModal(null)}>
          {modal.alert.alertMessage}
        </Modal>
      )}

      <div
        className="bg-darkgreen mb-3 no-container-margin"
        style={{ width: "100%", padding: "16px 24px" }}
      >
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "700" }}>Panel Institucional · INAB - SIG</h1>
      </div>
      {projectList.length > 0 ? (
        <div id="srd" style={{ width: "100%", margin: "10px", padding: "3%" }}>
          <DataTable
            columns={columns}
            data={filteredItems}
            subHeader
            subHeaderComponent={subHeaderComponentMemo}
          />
        </div>
      ) : (
        <div className="mx-4 my-3 d-flex align-items-center" style={{ width: "90%", padding: "20px 24px", background: "#f8faf9", borderRadius: "8px", border: "1px solid #d6e2dd" }}>
          <SvgIcon icon="alert" size="1.4rem" color="#1F7067" />
          <p style={{ marginLeft: "0.8rem", marginBottom: 0, fontSize: "14px", color: "#2f3e2f" }}>
            El panel de proyectos está listo. Cuando se registren proyectos de validación forestal para el INAB, se mostrarán aquí con sus métricas y progreso.
          </p>
        </div>
      )}
    </div>
  );
};

export function pageInit(params, session) {
  ReactDOM.render(
    <NavigationBar userId={session.userId} userName={session.userName} version={session.versionDeployed}>
      <BreadCrumbs
        crumbs={[
          {display:"Panel Institucional · INAB",
           id: "inst-dash",}]}
      />
      <InstitutionDashboard institutionId={params.institutionId || "1"} />
    </NavigationBar>,
    document.getElementById("app")
  );
}
