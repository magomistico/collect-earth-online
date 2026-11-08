import React, { useEffect, useState } from "react";
import { atom, useAtom, useAtomValue } from 'jotai';
import SvgIcon from "../components/svg/SvgIcon";
import { zoomMapToPoint } from '../utils/newMercator';
import { stateAtom } from '../utils/constants';
import MapPanel from '../mapPanel';
import "../../css/highlights.css";


function Tag ({tag}) {
  return (
    <div className="tag"
      onClick={()=>{console.log('search for tags by tag-id:', tag);}}>
      <span>{tag}</span>
    </div>
  );
}

function blogDate (date) {
  const newDate = new Date(date);
  return newDate.toDateString();
}

function Blogs ({blogs}) {
  return blogs.length > 0  ? (
    <div id="blogs">
      {blogs.map((blog)=>{
        return (
          <div className="blog-frame" key={blog.link}>
            <div className="blog">
              <div className="blog-graphic"
                style={{background: `url(${blog.img}) lightgray 50% / cover no-repeat`
                }}
              ></div>
              <div className="blog-body">
                <div className="blog-date">
                  <SvgIcon icon='calendar' size='1rem'/>
                  <span>{blogDate(blog.pubDate)}</span>
                </div>
                <div className="blog-title-row">
                  <div className="blog-title"
                    onClick={()=> {window.open(blog.link, "_blank", "noopener,noreferrer");}}>
                    <span>{blog.title}</span>
                    <SvgIcon icon="chevronRight" size="1.2rem" color="#1F7067"/>
                  </div>
                </div>
                <div className="blog-subtitle">{blog.description}</div>
                {blog.category?.length > 0 &&
                  <div className="tags">
                    {blog.category.map((tag)=> {
                      return (
                        <Tag key={tag} tag={tag}/>);
                    })}
                  </div>}
              </div>
            </div>
          </div>);
      })}
    </div>)
    : (<div></div>);
}

function ProjectCard ({project, mapConfig}) {
  const [seeMore, toggleDescription] = useState(false);
  const expandStyle = seeMore ? {} : {height: "3rem", overflow:"hidden"};
  const description = project.description || "";
  return (
    <div className="project">
      <div className="project-info">
        <span className="project-title">{project.name}</span>
        <div className="project-attribution"
          onClick={() => {window.location.href = `/institution-dashboard?institutionId=${project.institutionId}`;}}>
          <SvgIcon icon="institution" size="1.2rem"/>
          <span>{project.institutionName}</span>
        </div>
        {project.tags?.length > 0 &&
          <div className="tags">
            {project.tags.map((tag)=>{
              return(
                <Tag key={tag} tag={tag}/>);})}
          </div>}
        <div className="project-description">
          <p style={expandStyle}
          >{description}</p>
          {description.length > 168 &&
            <div className="expand-description"
              onClick={()=>{toggleDescription(!seeMore);}}
            ><span>{seeMore ? "Hide Description" : "See More"}</span></div>}
        </div>
      </div>
      <div className="project-controls">
        <div className="ghost-button">
          <div
            onClick={()=>{
              zoomMapToPoint(mapConfig?.map, JSON.parse(project.centroid).coordinates, 9, 500);
            }}
          >
            <SvgIcon icon="zoomIn" size="1rem"/>
            <span>Zoom to Project on Map</span>
          </div>
        </div>
        <div className="primary-button"
          onClick={() => window.location.href =
                   `/collection?projectId=${project.id}&institutionId=${project.institutionId}`} >
          <div>
            <span>Visit Project</span>
            <SvgIcon icon="chevronRight" size="1.2rem"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function Projects ({projects, imagery}) {
  // One atom per mount, so the map is created once and survives re-renders.
  const [mapConfigAtom] = useState(() => atom(null));
  const mapConfig = useAtomValue(mapConfigAtom);
  return (
    <div id="projects">
      <div id="projects-column">
        {projects.map((project)=>{return(<ProjectCard key={project.id} project={project} mapConfig={mapConfig}/>);})}
      </div>
      <div id="projects-map-container">
        <div id="projects-map">
          <MapPanel
            mapConfigAtom={mapConfigAtom}
            imagery={imagery}
            projects={projects}/>
        </div></div>
    </div>
  );
}

export default function Highlights ({userId, userRole}) {
  const [appState, setAppState] = useAtom(stateAtom);

  function getBlogs () {
    const blogUrl = "http://collect.earth/feed";
    const blogLimit = 7;
    return fetch(`/get-blog-feed?url=${blogUrl}&limit=${blogLimit}`)
      .then((response)=> (response.ok? response.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAppState(prev => ({ ...prev, blogs: data }));
        }
      })
      .catch(() => {});
  }
  
  function getProjects () {
    return fetch("/get-highlight-projects")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAppState(prev => ({ ...prev, projects: data }));
        }
      })
      .catch(() => {});
  }

  function getImagery () {
    return fetch("/get-public-imagery")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {          
          setAppState(prev => ({ ...prev, imagery: data }));          
        }
      })
      .catch(() => {});
  }
  
  function getInstitutions () {
    return fetch("/get-all-institutions")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const userInstitutions =
            userRole !== "admin"
              ? data.filter((institution) => institution.isMember)
              : [];
          const institutions =
            userInstitutions.length > 0
              ? data.filter((institution) => !userInstitutions.includes(institution))
              : data;
          setAppState(prev => ({ ...prev,
            institutions,
            userInstitutions,
          }));
        }
      })
      .catch(() => {});
  }
  
  useEffect(()=>{
    Promise.allSettled([getImagery(), getInstitutions(), getProjects(), getBlogs()]);
  }, []);

  function InabHero () {
    return (
      <div style={{
        width: "100%",
        background: "transparent",
        padding: "0",
        margin: "0 0 10px 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <iframe
          src="/inab-interactivo.html"
          style={{
            width: "100%",
            height: "450px",
            border: "none",
            background: "transparent",
            display: "block"
          }}
          title="INAB SIG Logo Interactivo"
        />
      </div>
    );
  }

  function CeoAttribution () {
    return (
      <div style={{
        width: "100%",
        background: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #d0ded8",
        padding: "28px 32px",
        boxShadow: "0 2px 8px rgba(31, 112, 103, 0.06)",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "28px",
        flexWrap: "wrap",
        boxSizing: "border-box"
      }}>
        <div style={{ flex: "1 1 480px" }}>
          <div style={{
            display: "inline-block",
            fontSize: "12px",
            fontWeight: "700",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#1F7067",
            background: "#E9F1F0",
            padding: "4px 10px",
            borderRadius: "4px",
            marginBottom: "12px"
          }}>
            Código Abierto y Atribución
          </div>
          <h3 style={{
            fontSize: "19px",
            fontWeight: "700",
            color: "#1d2939",
            margin: "0 0 10px 0"
          }}>
            Adaptación Institucional basada en Collect Earth Online (CEO)
          </h3>
          <p style={{
            fontSize: "14px",
            lineHeight: "1.65",
            color: "#475467",
            margin: "0 0 16px 0"
          }}>
            Esta plataforma institucional del <strong>Instituto Nacional de Bosques (INAB · SIG)</strong> ha sido adaptada y personalizada a partir del software de código abierto <strong>Collect Earth Online (CEO)</strong>, desarrollado originalmente por <strong>Open Foris (FAO)</strong> y <strong>SERVIR (NASA / USAID)</strong> para la interpretación visual de imágenes satelitales y validación geoespacial.
          </p>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
            <a
              href="https://collect.earth/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: "600",
                color: "#1F7067",
                textDecoration: "none",
                background: "#f0f7f5",
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid #cce3de"
              }}
            >
              <span>Sitio oficial de Collect Earth Online</span>
              <SvgIcon icon="chevronRight" size="1rem" color="#1F7067" />
            </a>
            <a
              href="https://github.com/openforis/collect-earth-online"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: "500",
                color: "#667085",
                textDecoration: "none"
              }}
            >
              <span>Repositorio Open Source (GitHub)</span>
              <SvgIcon icon="chevronRight" size="0.9rem" />
            </a>
          </div>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          padding: "18px 24px",
          background: "#f8faf9",
          borderRadius: "10px",
          border: "1px solid #e1e8e5",
          minWidth: "220px"
        }}>
          <img
            src="/img/ceo-logo.png"
            alt="Collect Earth Online"
            style={{
              height: "46px",
              width: "auto",
              objectFit: "contain"
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", opacity: 0.85 }}>
            <img
              src="/img/openforis-logo.png"
              alt="Open Foris"
              style={{ height: "22px", width: "auto", objectFit: "contain" }}
            />
          </div>
        </div>
      </div>
    );
  }

  const highlights = {
    welcome: {
      title: "Portal de Validación Forestal - INAB SIG",
      subtitle: "Herramienta institucional del Instituto Nacional de Bosques para la interpretación y validación espacial.",
      children: <InabHero />
    },
    attribution: {
      title: "Plataforma de Código Abierto",
      subtitle: "Reconocimiento institucional a la tecnología base de Collect Earth Online.",
      children: <CeoAttribution />
    }
  };
  
  return (
    <div id="highlights-tab" className="home-tab">
      <div className="header">
        <div className="header-row">
          <span className="header-title">INAB · SIG</span>
          <span className="header-subtitle">Sistema Institucional de Monitoreo y Validación Forestal</span>
        </div>
      </div>
      <div className="highlights-body">
        <div className="highlights">
          {Object.entries(highlights).map(([id, highlight])=>{
            return (
              <div className="highlight" key={id}>
                <div className="highlight-header">
                  <div className="highlight-title">
                    <span>{highlight.title}</span>
                    {highlight.link &&
                      <div className="highlight-link"
                        onClick={()=>{window.open(highlight.link);}}>
                        <span>View All</span>
                        <SvgIcon icon="chevronRight" size="1.2rem"/>
                      </div>}
                  </div>
                  <div className="highlight-subtitle">{highlight.subtitle}</div>
                </div>
                {highlight.children}                
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
