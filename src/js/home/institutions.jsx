import React, { useEffect, useState, useMemo } from "react";
import { atom, useAtom } from 'jotai';
import SvgIcon from "../components/svg/SvgIcon";
//import { mercator } from './utils/mercator';
import { stateAtom } from '../utils/constants';
import MapPanel from '../mapPanel';
import { Sidebar, SidebarCard, SidebarSearch, SidebarTabs } from "../components/Sidebar";

import "../../css/highlights.css";


export default function Institutions ({userId, userRole, projects}) {
  const [appState, setAppState] = useAtom(stateAtom);
  const [mapConfigAtom] = useState(() => atom(null));
  
  function InstitutionSidebar ({
    institutions = [],
    projects = [],
    userInstitutions = [],
    userId,
    userRole,
    stateAtom
  }) {
    const projectsByInstitution = useMemo(() => {
      const map = {};
      for (const p of projects) {
        if (!map[p.institutionId]) map[p.institutionId] = [];
        map[p.institutionId].push(p);
      }
      return map;
    }, [projects]);

    const institutionList = useMemo(() => {
      if (institutions && institutions.length > 0) {
        return institutions;
      }
      return [{ id: 1, name: "INAB - SIG" }];
    }, [institutions]);

    const filteredList = useMemo(() => {
      if (!search) return institutionList;
      return institutionList.filter(({name}) => (name || "").toLowerCase().includes(search.toLowerCase()));
    }, [institutionList, search]);
    
    return (
      <Sidebar header={null} stateAtom={stateAtom} footer={null} style={{ left: 0, width: "30vw", position: "fixed" }}>
        <SidebarCard title="Institución Oficial">
          <div style={{
            padding: "8px 0 16px 0",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px",
              background: "#F4F8F6",
              borderRadius: "8px",
              border: "1px solid #D6E5DF"
            }}>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "8px",
                background: "#1F7067",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: "bold",
                fontSize: "14px",
                flexShrink: 0
              }}>
                INAB
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#1F7067" }}>
                  INAB · SIG
                </div>
                <div style={{ fontSize: "12px", color: "#5F746C" }}>
                  Instituto Nacional de Bosques
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "12px 16px",
                background: "#1F7067",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 2px 4px rgba(31, 112, 103, 0.2)",
                transition: "background 0.2s ease"
              }}
              onClick={() => {
                const targetId = institutionList[0]?.id || 1;
                window.location.href = `/review-institution?institutionId=${targetId}`;
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#185851")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#1F7067")}
            >
              <span>Entrar a INAB - SIG</span>
              <SvgIcon icon="chevronRight" size="1.2rem" color="#fff" />
            </div>

            <SidebarSearch value={search} onChange={setSearch}/>
          </div>
        </SidebarCard>

        {filteredList.map((inst) => {
          const instProjects = projectsByInstitution[inst.id] || [];
          return (
            <SidebarCard key={inst.id} title={inst.name || "INAB - SIG"} collapsible defaultOpen={true}>
              <div
                className="institution-project-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "10px 14px 14px 14px",
                  background: "#f8faf9",
                  borderRadius: "0 0 6px 6px",
                }}
              >
                <div
                  className="project-item"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #1F7067",
                    borderRadius: "6px",
                    background: "#1F7067",
                    cursor: "pointer",
                    fontWeight: 600,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    textAlign: "center",
                  }}
                  onClick={() => (window.location.href = `/review-institution?institutionId=${inst.id}`)}
                >
                  <span>Ver Panel Institucional</span>
                  <SvgIcon icon="chevronRight" size="1.1rem" color="#fff" />
                </div>
                {instProjects.length > 0 ? (
                  instProjects.map((project) => (
                    <div
                      key={project.id}
                      className="project-item"
                      style={{
                        padding: "10px 12px",
                        border: "1px solid #dfe4e1",
                        borderRadius: "6px",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 500,
                        color: "#2f3e2f",
                        transition: "background 0.15s ease",
                      }}
                      onClick={() => (window.location.href =
                                      `/project-wizard?projectId=${project.id}&institutionId=${inst.id}`)}
                      onMouseOver={(e) => (e.currentTarget.style.background = "#f1f5f3")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
                    >
                      {project.name}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: "12px", color: "#667085", padding: "6px 4px", textAlign: "center" }}>
                    No hay proyectos registrados aún.
                  </div>
                )}
              </div>
            </SidebarCard>
          );
        })}
      </Sidebar>
    );
  };


  return (
    <div id='institutions-tab' className='home-tab'>
        <InstitutionSidebar
          institutions={appState.institutions}
          projects={appState.projects}
          userId={userId}
          userInstitutions={appState.userInstitutions}
          userRole={userRole}
          stateAtom={stateAtom}
        />
        <div id="institutions-map-container">
        <MapPanel
          imagery={appState.imagery}
          projects={projects || []}
          mapConfigAtom={mapConfigAtom}
      />
    </div>
      </div>
  );
}
