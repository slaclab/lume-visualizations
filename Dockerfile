ARG PYTHON_VERSION=3.11
ARG LCLS_LATTICE_REF=52ad1a5ddd00aa57a89a4fc7f2fa1a2363216ae8
ARG DOCKER_PLATFORM=linux/amd64

FROM --platform=${DOCKER_PLATFORM} python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH=/opt/conda/bin:$PATH \
    LCLS_LATTICE=/opt/lcls-lattice

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash bzip2 curl git \
    && rm -rf /var/lib/apt/lists/*

RUN arch="$(dpkg --print-architecture)" \
    && case "${arch}" in \
        amd64) conda_arch="x86_64" ;; \
        arm64) conda_arch="aarch64" ;; \
        *) echo "Unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${conda_arch}.sh" -o /tmp/miniforge.sh \
    && bash /tmp/miniforge.sh -b -p /opt/conda \
    && rm -f /tmp/miniforge.sh \
    && conda config --system --add channels conda-forge \
    && conda config --system --set channel_priority strict \
    && conda install -y "python=${PYTHON_VERSION}" pip pytao bmad \
    && conda clean -afy

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY lume_visualizations /app/lume_visualizations

RUN git clone https://github.com/slaclab/lcls-lattice.git /opt/lcls-lattice \
    && cd /opt/lcls-lattice \
    && git checkout ${LCLS_LATTICE_REF}

RUN git clone https://github.com/pluflou/virtual-accelerator.git /opt/virtual-accelerator \
    && cd /opt/virtual-accelerator \
    && python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install -e . \
    && python -m pip install /app

EXPOSE 2718 2719

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["lume-live-monitor", "--host", "0.0.0.0", "--port", "2719", "--headless"]
