use std::time::Duration;

use tonic::{
    service::{interceptor::InterceptedService, Interceptor},
    transport::{Channel, Endpoint},
    Request, Status,
};

/// Shared client transport type used by every BFF gRPC client.
pub type DeadlineChannel = InterceptedService<Channel, GrpcDeadlineInterceptor>;

#[derive(Clone, Copy, Debug)]
pub struct GrpcDeadlineInterceptor {
    timeout: Duration,
}

impl GrpcDeadlineInterceptor {
    pub fn new(timeout: Duration) -> Self {
        Self { timeout }
    }
}

impl Interceptor for GrpcDeadlineInterceptor {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        request.set_timeout(self.timeout);
        Ok(request)
    }
}

/// Creates a lazy gRPC channel with both a local transport timeout and a
/// server-visible grpc-timeout metadata value on every RPC.
pub fn deadline_channel(
    endpoint: Endpoint,
    timeout: Duration,
    connect_timeout: Duration,
) -> DeadlineChannel {
    let channel = endpoint
        .connect_timeout(connect_timeout)
        .timeout(timeout)
        .connect_lazy();

    InterceptedService::new(channel, GrpcDeadlineInterceptor::new(timeout))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tonic::service::Interceptor;

    #[test]
    fn interceptor_adds_server_visible_grpc_timeout_metadata() {
        let timeout = Duration::from_secs(5);
        let mut interceptor = GrpcDeadlineInterceptor::new(timeout);

        let request = interceptor.call(Request::new(())).unwrap();

        assert_eq!(
            request.metadata().get("grpc-timeout").unwrap(),
            "5000000u"
        );
    }

    #[test]
    fn interceptor_uses_the_configured_duration_for_each_request() {
        let mut interceptor = GrpcDeadlineInterceptor::new(Duration::from_secs(75));
        let request = interceptor.call(Request::new(())).unwrap();

        assert_eq!(
            request.metadata().get("grpc-timeout").unwrap(),
            "75000000u"
        );
    }
}
