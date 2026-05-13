FROM python:3.11-slim

# Install system dependencies and SSH for remote testing
RUN apt-get update && apt-get install -y \
    openssh-server \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set up SSH for testing (root:root)
RUN mkdir -p /var/run/sshd
RUN echo 'root:root' | chpasswd
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

# Set workspace
WORKDIR /app

# Copy everything
COPY . .

# Install the backend package
WORKDIR /app/backend
RUN pip install --no-cache-dir -e .

# Back to root app
WORKDIR /app

# Expose FastAPI and SSH ports
EXPOSE 8000 22

# Start SSH daemon in foreground
CMD ["/usr/sbin/sshd", "-D"]
